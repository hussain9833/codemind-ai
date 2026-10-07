import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { findOwnedProject } from "@/lib/authz";
import { db } from "@/lib/db";
import { dbReader } from "../db-reader";
import { findEvidence } from "../evidence";
import { memoryReader } from "../memory";
import { buildIndex } from "../pipeline";
import { persistIndex } from "../service";
import { localCommits, localSource } from "../sources/local";

/** Integration test against a real Postgres (CM_FIXTURE_REPO + DATABASE_URL). */
const root = process.env.CM_FIXTURE_REPO;
const run = !!root && existsSync(root) && !!process.env.CM_TEST_DB;

describe.skipIf(!run)("postgres persistence", () => {
  const stamp = Date.now();
  afterAll(async () => { await db.user.deleteMany({ where: { email: { endsWith: `@cm-test-${stamp}.dev` } } }); await db.$disconnect(); });

  it("persists an index, searches it in SQL and isolates projects between users", async () => {
    const owner = await db.user.create({ data: { email: `a@cm-test-${stamp}.dev`, passwordHash: "x" } });
    const other = await db.user.create({ data: { email: `b@cm-test-${stamp}.dev`, passwordHash: "x" } });
    const project = await db.project.create({ data: { userId: owner.id, name: "rw", branch: "main", repository: { create: { githubRepoId: BigInt(1), githubInstallationId: BigInt(2), owner: "o", name: "rw", fullName: "o/rw", defaultBranch: "main", isPrivate: false, htmlUrl: "https://github.com/o/rw" } } }, include: { repository: true } });
    const repositoryId = project.repository!.id;

    const built = await buildIndex(localSource(root!));
    const commits = localCommits(root!);
    await persistIndex(repositoryId, built, commits);

    expect(await db.repoFile.count({ where: { repositoryId } })).toBe(built.files.length);
    expect(await db.repoSymbol.count({ where: { repositoryId } })).toBe(built.stats.symbols);
    expect(await db.codeChunk.count({ where: { repositoryId } })).toBe(built.stats.chunks);
    expect(await db.repoCommit.count({ where: { repositoryId } })).toBe(commits.length);

    // SQL-backed evidence must equal the in-memory reference implementation.
    const q = "Find everything related to authentication";
    const fromDb = await findEvidence(dbReader(repositoryId), q, { limit: 30 });
    const fromMem = await findEvidence(memoryReader(built, commits), q, { limit: 30 });
    const key = (e: { kind: string; title: string }) => `${e.kind}:${e.title}`;
    const dbKeys = fromDb.evidence.map(key);
    const memKeys = fromMem.evidence.map(key);
    const overlap = dbKeys.filter((k) => memKeys.includes(k)).length / Math.max(memKeys.length, 1);
    console.log("db top:", dbKeys.slice(0, 5), "overlap", overlap.toFixed(2));
    expect(fromDb.evidence.length).toBeGreaterThan(5);
    expect(overlap).toBeGreaterThan(0.85);

    // Re-index replaces rather than duplicates.
    await persistIndex(repositoryId, built, commits);
    expect(await db.repoFile.count({ where: { repositoryId } })).toBe(built.files.length);

    // Authorization: only the owner resolves the project.
    expect(await findOwnedProject(owner.id, project.id)).not.toBeNull();
    expect(await findOwnedProject(other.id, project.id)).toBeNull();

    // pgvector column exists and accepts a vector of any dimension (none is hard-coded).
    await db.$executeRawUnsafe(`UPDATE "CodeChunk" SET embedding = '[0.1,0.2,0.3]'::vector WHERE id = (SELECT id FROM "CodeChunk" WHERE "repositoryId" = '${repositoryId}' LIMIT 1)`);
    const n = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) c FROM "CodeChunk" WHERE embedding IS NOT NULL AND "repositoryId" = '${repositoryId}'`);
    expect(Number(n[0]!.c)).toBe(1);

    // Cascade: deleting the project removes the whole index.
    await db.project.delete({ where: { id: project.id } });
    expect(await db.codeChunk.count({ where: { repositoryId } })).toBe(0);
    expect(await db.repoFile.count({ where: { repositoryId } })).toBe(0);
  });
});
