import "server-only";
import { log } from "@/lib/log";
import { redactSecrets } from "./redact";
import type { TrackedProvider } from "./execution";
import { embeddingCounts, ensureVectorIndex, pendingChunks, storeEmbeddings } from "./vector";

const BATCH = 48;
const MAX_CHARS = 6000;

/** What gets embedded: location + symbol give the model context the raw code lacks. */
const embeddingText = (c: { filePath: string; symbol: string | null; content: string }) =>
  redactSecrets(`${c.filePath}${c.symbol ? ` — ${c.symbol}` : ""}\n${c.content}`).slice(0, MAX_CHARS);

export interface EmbedProgress { embedded: number; total: number; done: boolean; model: string; dimension: number }

/**
 * Embeds chunks that don't have a vector from the current model. Resumable: it stops when the
 * time budget is spent and reports what remains, so large repositories finish over several calls.
 */
export async function embedRepository(repositoryId: string, ai: TrackedProvider, budgetMs = 240_000): Promise<EmbedProgress> {
  const started = Date.now();
  const { model, dimension } = await ai.raw.embeddingInfo(); // dimension is read from the model
  await ensureVectorIndex(dimension);

  for (;;) {
    if (Date.now() - started > budgetMs) break;
    const batch = await pendingChunks(repositoryId, model, BATCH);
    if (!batch.length) break;
    const res = await ai.embed("embeddings", batch.map(embeddingText), { inputType: "passage" });
    if (res.dimension !== dimension) throw new Error(`Embedding dimension changed mid-run (${dimension} -> ${res.dimension})`);
    await storeEmbeddings(batch.map((c, i) => ({ id: c.id, vector: res.vectors[i]! })), model, dimension);
  }
  const counts = await embeddingCounts(repositoryId, model);
  log.info("ai.embed.progress", { repositoryId, embedded: counts.embedded, total: counts.total, model, dimension });
  return { ...counts, done: counts.embedded >= counts.total, model, dimension };
}
