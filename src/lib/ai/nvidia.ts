import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { AIError, type AIProvider, type AIErrorCode, type ChatMessage, type ChatOptions, type ChatResult, type EmbedOptions, type EmbedResult } from "./types";

const DEFAULTS = {
  baseUrl: "https://integrate.api.nvidia.com/v1",
  chatModel: "google/gemma-4-31b-it",
  // Verified to answer on this account (poolside/laguna was ~90s on realistic prompts, so it is not a default).
  fallbacks: ["nvidia/nemotron-3-super-120b-a12b", "meta/llama-3.2-11b-vision-instruct"],
  embedModel: "nvidia/nemotron-3-embed-1b",
};

/** A model that emits nothing for this long is treated as stalled. */
const FIRST_BYTE_MS = 25_000;
/** Once a model is streaming, it may take this long to finish. */
const TOTAL_MS = 150_000;
const EMBED_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const EMBED_BATCH = 64;
/** A model that times out or disappears is skipped for this long (per server instance). */
const CIRCUIT_MS = 5 * 60_000;
const circuit = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Removes reasoning blocks some models inline in `content`. */
const stripThinking = (t: string) => t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

function classify(status: number): { code: AIErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: "auth", retryable: false };
  if (status === 402) return { code: "quota", retryable: false };
  if (status === 404 || status === 410) return { code: "unavailable", retryable: false }; // model not available to this account / retired
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status >= 500) return { code: "unavailable", retryable: true };
  return { code: "bad_request", retryable: false };
}

/** Reasoning models spend completion tokens on hidden thinking; give them headroom or `content` comes back empty. */
const REASONING = /nemotron-3-(super|ultra|nano)|lightning|reasoning|r1|thinking/i;
const budgetFor = (model: string, requested: number) => (REASONING.test(model) ? Math.max(requested * 2, 3500) : requested);

export class NVIDIAProvider implements AIProvider {
  readonly name = "nvidia-nim";
  readonly chatModels: string[];
  readonly embedModel: string;
  private baseUrl: string;
  private apiKey: string;
  private dim: Promise<number> | null = null;

  constructor() {
    const e = env();
    if (!e.NVIDIA_API_KEY) throw new AIError("not_configured", "NVIDIA_API_KEY is not set on the server");
    this.apiKey = e.NVIDIA_API_KEY;
    this.baseUrl = (e.NVIDIA_BASE_URL ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    const fallbacks = e.NVIDIA_CHAT_FALLBACK_MODELS ? e.NVIDIA_CHAT_FALLBACK_MODELS.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULTS.fallbacks;
    this.chatModels = [...new Set([e.NVIDIA_CHAT_MODEL ?? DEFAULTS.chatModel, ...fallbacks])];
    this.embedModel = e.NVIDIA_EMBED_MODEL ?? DEFAULTS.embedModel;
  }

  /** One HTTP call with timeout + bounded retries. Never logs the key, prompts or completions. */
  private async post<T>(path: string, body: unknown, timeoutMs: number, outer?: AbortSignal): Promise<T> {
    let lastErr: AIError | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const signal = outer ? AbortSignal.any([outer, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal,
          cache: "no-store",
        });
        if (res.ok) return (await res.json()) as T;
        const { code, retryable } = classify(res.status);
        lastErr = new AIError(code, `NVIDIA API returned HTTP ${res.status}`, retryable);
        if (!retryable) throw lastErr;
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * 2 ** attempt, 8000));
      } catch (e) {
        if (e instanceof AIError) { if (!e.retryable) throw e; lastErr = e; continue; }
        if (outer?.aborted) throw new AIError("timeout", "Request was cancelled");
        const name = (e as { name?: string }).name;
        if (name === "TimeoutError" || name === "AbortError") throw new AIError("timeout", `NVIDIA API did not respond within ${Math.round(timeoutMs / 1000)}s`, true);
        lastErr = new AIError("unavailable", "Could not reach the NVIDIA API", true);
        await sleep(600 * 2 ** attempt);
      }
    }
    throw lastErr ?? new AIError("unavailable", "NVIDIA API request failed");
  }

  /**
   * One streamed completion. Streaming lets us tell a STALLED model (no first byte) from a SLOW one
   * (still generating): stalled models are abandoned after FIRST_BYTE_MS, slow ones get the full budget.
   */
  private async streamChat(model: string, messages: ChatMessage[], options: ChatOptions) {
    const firstByteMs = options.timeoutMs ?? FIRST_BYTE_MS;
    let lastErr: AIError | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const ctl = new AbortController();
      const onOuter = () => ctl.abort(new AIError("timeout", "Request was cancelled"));
      options.signal?.addEventListener("abort", onOuter, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => ctl.abort(new AIError("timeout", `Model produced no output within ${Math.round(firstByteMs / 1000)}s`, true)), firstByteMs);
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ model, messages, max_tokens: budgetFor(model, options.maxTokens ?? 1500), temperature: options.temperature ?? 0.2, stream: true, stream_options: { include_usage: true } }),
          signal: ctl.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) {
          const { code, retryable } = classify(res.status);
          lastErr = new AIError(code, `NVIDIA API returned HTTP ${res.status}`, retryable);
          if (!retryable) throw lastErr;
          const ra = Number(res.headers.get("retry-after"));
          clearTimeout(timer);
          await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * 2 ** attempt, 8000));
          continue;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "", text = "", finish: string | undefined, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined, started = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (!started) { started = true; clearTimeout(timer); timer = setTimeout(() => ctl.abort(new AIError("timeout", "Model stopped responding mid-answer", true)), TOTAL_MS); }
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload) as { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
              const c = j.choices?.[0];
              if (c?.delta?.content) text += c.delta.content;
              if (c?.finish_reason) finish = c.finish_reason;
              if (j.usage) usage = j.usage;
            } catch { /* ignore keep-alive / partial lines */ }
          }
        }
        return { text, finish, usage };
      } catch (e) {
        if (e instanceof AIError) { if (!e.retryable) throw e; lastErr = e; if (e.code === "timeout") throw e; continue; }
        const reason = ctl.signal.reason;
        if (reason instanceof AIError) throw reason;
        lastErr = new AIError("unavailable", "Could not reach the NVIDIA API", true);
        await sleep(600 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onOuter);
      }
    }
    throw lastErr ?? new AIError("unavailable", "NVIDIA API request failed");
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const skipped: ChatResult["skipped"] = [];
    const t0 = Date.now();
    for (const model of this.chatModels) {
      if ((circuit.get(model) ?? 0) > Date.now()) { skipped.push({ model, reason: "unavailable" }); continue; }
      try {
        const out = await this.streamChat(model, messages, options);
        const text = stripThinking(out.text);
        if (!text) { skipped.push({ model, reason: "empty_response" }); continue; } // e.g. a reasoning model that spent its budget thinking
        return { text, model, usage: { inputTokens: out.usage?.prompt_tokens, outputTokens: out.usage?.completion_tokens }, finishReason: out.finish, skipped, latencyMs: Date.now() - t0 };
      } catch (e) {
        if (!(e instanceof AIError)) throw e;
        if (e.code === "auth" || e.code === "quota" || e.code === "bad_request") throw e; // another model won't fix these
        if (e.code === "timeout" || e.code === "unavailable") circuit.set(model, Date.now() + CIRCUIT_MS);
        skipped.push({ model, reason: e.code });
        log.warn("ai.chat.model_skipped", { model, reason: e.code });
      }
    }
    throw new AIError("unavailable", `No chat model responded (${skipped.map((s) => `${s.model}: ${s.reason}`).join(", ")})`, true);
  }

  async embed(texts: string[], options: EmbedOptions): Promise<EmbedResult> {
    if (texts.length === 0) return { vectors: [], model: this.embedModel, dimension: await this.dimension(), usage: {}, latencyMs: 0 };
    const t0 = Date.now();
    const vectors: number[][] = [];
    let tokens = 0;
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const data = await this.post<{ data?: { index: number; embedding: number[] }[]; usage?: { prompt_tokens?: number; total_tokens?: number } }>(
        "/embeddings",
        { model: this.embedModel, input: texts.slice(i, i + EMBED_BATCH), input_type: options.inputType, encoding_format: "float", truncate: "END" },
        EMBED_TIMEOUT_MS,
        options.signal,
      );
      const rows = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
      if (rows.length !== Math.min(EMBED_BATCH, texts.length - i)) throw new AIError("invalid_output", "Embedding response had an unexpected number of vectors");
      vectors.push(...rows.map((r) => r.embedding));
      tokens += data.usage?.total_tokens ?? data.usage?.prompt_tokens ?? 0;
    }
    const dimension = vectors[0]!.length;
    if (vectors.some((v) => v.length !== dimension)) throw new AIError("invalid_output", "Embedding dimensions were inconsistent");
    return { vectors, model: this.embedModel, dimension, usage: { inputTokens: tokens }, latencyMs: Date.now() - t0 };
  }

  /** The dimension is whatever the model returns: probed once, never hard-coded. */
  embeddingInfo() {
    this.dim ??= this.embed(["dimension probe"], { inputType: "query" }).then((r) => r.dimension).catch((e) => { this.dim = null; throw e; });
    return this.dim.then((dimension) => ({ model: this.embedModel, dimension }));
  }

  private async dimension() { return (await this.embeddingInfo()).dimension; }
}

let instance: NVIDIAProvider | undefined;
/** The provider used by the app. Swap the implementation here to change vendors. */
export function getAIProvider(): AIProvider {
  return (instance ??= new NVIDIAProvider());
}
