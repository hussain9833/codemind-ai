/**
 * Provider-neutral AI abstractions. The rest of the application depends only on these
 * types; NVIDIA-specific details live in nvidia.ts.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TokenUsage { inputTokens?: number; outputTokens?: number }

export interface ChatResult {
  text: string;
  /** Model that actually produced the answer (may be a fallback). */
  model: string;
  usage: TokenUsage;
  finishReason?: string;
  /** Models skipped before this one, with the reason. */
  skipped: { model: string; reason: AIErrorCode }[];
  latencyMs: number;
}

export interface EmbedOptions {
  /** "query" for search queries, "passage" for indexed documents (asymmetric models need both). */
  inputType: "query" | "passage";
  signal?: AbortSignal;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  /** Read from the model's response; never assumed. */
  dimension: number;
  usage: TokenUsage;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;
  /** Primary + fallback chat models, in order. */
  readonly chatModels: string[];
  readonly embedModel: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  embed(texts: string[], options: EmbedOptions): Promise<EmbedResult>;
  /** Probes the embedding model once and caches its dimension. */
  embeddingInfo(): Promise<{ model: string; dimension: number }>;
}

export type AIErrorCode = "not_configured" | "auth" | "rate_limited" | "timeout" | "unavailable" | "bad_request" | "empty_response" | "invalid_output" | "quota";

export class AIError extends Error {
  constructor(public code: AIErrorCode, message: string, public retryable = false) {
    super(message);
    this.name = "AIError";
  }
}
