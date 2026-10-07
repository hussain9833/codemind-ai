import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * pgvector access. The embedding dimension is supplied by the caller (read from the model);
 * nothing here hard-codes it. The `embedding` column is an unconstrained `vector`, so each row
 * records the model + dimension that produced it, and queries only compare rows of the same dimension.
 *
 * Index strategy: pgvector can only index up to 2000 dims for `vector`, but up to 4000 for
 * `halfvec`. We therefore index an expression cast to the right type for the model's dimension.
 */

const assertDim = (dim: number) => {
  if (!Number.isInteger(dim) || dim < 1 || dim > 4000) throw new Error(`Unsupported embedding dimension ${dim}`);
  return dim;
};
const typeFor = (dim: number) => (dim <= 2000 ? "vector" : "halfvec");
const opsFor = (dim: number) => (dim <= 2000 ? "vector_cosine_ops" : "halfvec_cosine_ops");
const cast = (dim: number) => Prisma.raw(`embedding::${typeFor(dim)}(${assertDim(dim)})`);
const castParam = (dim: number) => Prisma.raw(`${typeFor(dim)}(${assertDim(dim)})`);

const ensured = new Set<number>();

/** Creates the HNSW index for this dimension if missing. Safe to call repeatedly. */
export async function ensureVectorIndex(dim: number) {
  if (ensured.has(dim)) return;
  assertDim(dim);
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CodeChunk_embedding_hnsw_${dim}" ON "CodeChunk" USING hnsw ((embedding::${typeFor(dim)}(${dim})) ${opsFor(dim)}) WHERE "embeddingDim" = ${dim}`,
  );
  ensured.add(dim);
}

const literal = (v: number[]) => `[${v.join(",")}]`;

export async function storeEmbeddings(rows: { id: string; vector: number[] }[], model: string, dim: number) {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const vecs = rows.map((r) => literal(r.vector));
  await db.$executeRaw`
    UPDATE "CodeChunk" c
    SET "embedding" = v.e::vector, "embeddingModel" = ${model}, "embeddingDim" = ${assertDim(dim)}, "embeddedAt" = now()
    FROM (SELECT unnest(${ids}::text[]) AS id, unnest(${vecs}::text[]) AS e) v
    WHERE c.id = v.id`;
}

export interface PendingChunk { id: string; filePath: string; symbol: string | null; content: string }

/** Chunks with no embedding from the CURRENT model (new, or embedded by an older model). */
export async function pendingChunks(repositoryId: string, model: string, limit: number): Promise<PendingChunk[]> {
  return db.$queryRaw<PendingChunk[]>`
    SELECT id, "filePath", symbol, content FROM "CodeChunk"
    WHERE "repositoryId" = ${repositoryId} AND ("embeddingModel" IS DISTINCT FROM ${model} OR embedding IS NULL)
    ORDER BY "filePath", "startLine" LIMIT ${limit}`;
}

export async function embeddingCounts(repositoryId: string, model: string) {
  const [r] = await db.$queryRaw<{ total: bigint; embedded: bigint }[]>`
    SELECT count(*) AS total, count(*) FILTER (WHERE "embeddingModel" = ${model} AND embedding IS NOT NULL) AS embedded
    FROM "CodeChunk" WHERE "repositoryId" = ${repositoryId}`;
  return { total: Number(r?.total ?? 0), embedded: Number(r?.embedded ?? 0) };
}

export interface VectorHit { id: string; filePath: string; startLine: number; endLine: number; symbol: string | null; kind: string; content: string; similarity: number }

/** Nearest chunks by cosine similarity (1 = identical direction). */
export async function searchVectors(repositoryId: string, query: number[], dim: number, limit: number): Promise<VectorHit[]> {
  const q = literal(query);
  return db.$queryRaw<VectorHit[]>(Prisma.sql`
    SELECT id, "filePath", "startLine", "endLine", symbol, kind, content,
           1 - (${cast(dim)} <=> ${q}::${castParam(dim)}) AS similarity
    FROM "CodeChunk"
    WHERE "repositoryId" = ${repositoryId} AND "embeddingDim" = ${dim}
    ORDER BY ${cast(dim)} <=> ${q}::${castParam(dim)}
    LIMIT ${limit}`);
}
