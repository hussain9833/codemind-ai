import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { AIError, type AIProvider, type ChatMessage, type ChatOptions, type ChatResult, type EmbedOptions, type EmbedResult } from "./types";

/**
 * Every model call is recorded in AIExecution: purpose, model, status, tokens, latency and a
 * short error code. Prompts and completions are deliberately NOT stored — they contain
 * repository code and would widen the blast radius of a database leak.
 */

export interface ExecContext {
  userId: string;
  projectId: string;
  investigationId?: string;
}

const PER_MINUTE = 30;
const PER_HOUR = 600;

/** DB-backed so the limit holds across serverless instances. */
export async function assertWithinRateLimit(userId: string) {
  const now = Date.now();
  const [minute, hour] = await Promise.all([
    db.aIExecution.count({ where: { project: { userId }, createdAt: { gt: new Date(now - 60_000) } } }),
    db.aIExecution.count({ where: { project: { userId }, createdAt: { gt: new Date(now - 3_600_000) } } }),
  ]);
  if (minute >= PER_MINUTE) throw new AIError("rate_limited", "Too many AI requests in the last minute. Wait a moment and try again.");
  if (hour >= PER_HOUR) throw new AIError("rate_limited", "Hourly AI request limit reached. Try again later.");
}

async function record<T extends { model: string; usage: { inputTokens?: number; outputTokens?: number }; latencyMs: number }>(
  ctx: ExecContext, purpose: string, provider: AIProvider, run: () => Promise<T>,
): Promise<T> {
  await assertWithinRateLimit(ctx.userId);
  const row = await db.aIExecution.create({ data: { projectId: ctx.projectId, investigationId: ctx.investigationId, purpose, model: provider.chatModels[0] ?? "unknown", status: "PENDING" }, select: { id: true } });
  const t0 = Date.now();
  try {
    const result = await run();
    await db.aIExecution.update({ where: { id: row.id }, data: { status: "SUCCEEDED", model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, latencyMs: result.latencyMs } });
    return result;
  } catch (e) {
    const code = e instanceof AIError ? e.code : "internal_error";
    await db.aIExecution.update({ where: { id: row.id }, data: { status: "FAILED", error: code, latencyMs: Date.now() - t0 } }).catch(() => undefined);
    log.warn("ai.execution.failed", { purpose, code });
    throw e;
  }
}

/** Provider wrapper bound to one project/user: all calls are rate-limited and audited. */
export function trackedProvider(provider: AIProvider, ctx: ExecContext) {
  return {
    raw: provider,
    chat: (purpose: string, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> => record(ctx, purpose, provider, () => provider.chat(messages, options)),
    embed: (purpose: string, texts: string[], options: EmbedOptions): Promise<EmbedResult> => record(ctx, purpose, provider, () => provider.embed(texts, options)),
  };
}
export type TrackedProvider = ReturnType<typeof trackedProvider>;
