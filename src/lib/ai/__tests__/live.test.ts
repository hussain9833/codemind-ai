import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answerQuestion } from "../chat";
import { embedRepository } from "../embed-repo";
import { trackedProvider, type ExecContext } from "../execution";
import { getAIProvider } from "../nvidia";
import { retrieveContext } from "../retrieval";
import { embeddingCounts, searchVectors } from "../vector";
import { db } from "@/lib/db";
import { buildIndex } from "@/lib/repo/pipeline";
import { persistIndex } from "@/lib/repo/service";
import { localCommits, localSource } from "@/lib/repo/sources/local";

/**
 * LIVE test: real NVIDIA NIM + real Postgres (Neon). Run with:
 *   CM_LIVE_AI=1 CM_FIXTURE_REPO=<git checkout> node scripts/with-env.mjs npx vitest run live
 * Creates a throw-away user and removes it (and everything under it) afterwards.
 */
const root = process.env.CM_FIXTURE_REPO;
const live = !!process.env.CM_LIVE_AI && !!root && existsSync(root) && !!process.env.NVIDIA_API_KEY;

describe.skipIf(!live)("live NVIDIA + pgvector", () => {
  const email = `live-${Date.now()}@cm-test.dev`;
  let ctx: ExecContext;
  let repositoryId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email, passwordHash: "x" } });
    const project = await db.project.create({ data: { userId: user.id, name: "live", branch: "main", repository: { create: { githubRepoId: BigInt(9), githubInstallationId: BigInt(9), owner: "o", name: "rw", fullName: "o/rw", defaultBranch: "main", isPrivate: false, htmlUrl: "https://github.com/o/rw", indexStatus: "INDEXED" } } }, include: { repository: true } });
    repositoryId = project.repository!.id;
    ctx = { userId: user.id, projectId: project.id };
    const built = await buildIndex(localSource(root!));
    await persistIndex(repositoryId, built, localCommits(root!));
  }, 120_000);

  afterAll(async () => {
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  });

  it("reads the embedding dimension from the model and builds the vector index", async () => {
    const ai = trackedProvider(getAIProvider(), ctx);
    const info = await ai.raw.embeddingInfo();
    console.log("EMBEDDING", info);
    expect(info.dimension).toBeGreaterThan(0);
    const p = await embedRepository(repositoryId, ai, 200_000);
    console.log("EMBED PROGRESS", p);
    expect(p.done).toBe(true);
    const c = await embeddingCounts(repositoryId, info.model);
    expect(c.embedded).toBe(c.total);

    // the HNSW index for this dimension exists
    const idx = await db.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE tablename = 'CodeChunk' AND indexname LIKE 'CodeChunk_embedding_hnsw_%'`);
    console.log("INDEXES", idx.map((i) => i.indexname));
    expect(idx.length).toBeGreaterThan(0);

    // semantic search: no keyword overlap with "login" needed
    const q = await ai.embed("test.query", ["where do we check that a user's password is correct"], { inputType: "query" });
    const hits = await searchVectors(repositoryId, q.vectors[0]!, info.dimension, 5);
    console.log("VECTOR HITS", hits.map((h) => `${h.similarity.toFixed(3)} ${h.filePath}:${h.startLine} ${h.symbol ?? ""}`));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /auth/.test(h.filePath))).toBe(true);
  });

  it("hybrid retrieval returns a small cited context", async () => {
    const ai = trackedProvider(getAIProvider(), ctx);
    const r = await retrieveContext(repositoryId, "Why does the login API fail after the token is refreshed?", ai);
    console.log("CONTEXT", r.usedVector, r.items.map((i) => `${i.ref} ${i.kind} ${i.title}`));
    expect(r.usedVector).toBe(true);
    expect(r.items.length).toBeGreaterThan(2);
    expect(r.items.reduce((n, i) => n + i.text.length, 0)).toBeLessThan(30_000);
  });

  it("chat answers from evidence with valid citations, and refuses without evidence", async () => {
    const ai = trackedProvider(getAIProvider(), ctx);
    const a = await answerQuestion({ repositoryId, question: "How is the JWT token generated and which file does it?", ai });
    console.log("ANSWER", JSON.stringify({ insufficient: a.insufficient, model: a.model, refs: a.references.map((r) => r.title), removed: a.removedUnverified }), "\n", a.answer);
    expect(a.insufficient).toBe(false);
    expect(a.references.length).toBeGreaterThan(0);
    for (const ref of a.references) expect(ref.filePath ?? ref.commitSha ?? ref.dependency).toBeTruthy();

    const none = await answerQuestion({ repositoryId, question: "How does the Kubernetes autoscaler decide to add GPU nodes?", ai });
    console.log("NO-EVIDENCE ANSWER", none.insufficient, none.answer.slice(0, 200));
    expect(none.insufficient).toBe(true);
    expect(none.references.length === 0 || none.insufficient).toBe(true);

    const execs = await db.aIExecution.count({ where: { projectId: ctx.projectId } });
    const failed = await db.aIExecution.count({ where: { projectId: ctx.projectId, status: "FAILED" } });
    console.log("AI EXECUTIONS recorded:", execs, "failed:", failed);
    expect(execs).toBeGreaterThan(1);
  }, 280_000);
});
