import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { buildIndex } from "./pipeline";
import { fetchCommits, githubSource, resolveBranchHead, type RepoRef } from "./sources/github";
import type { BuiltIndex, CommitData } from "./types";

const BATCH = 500;
const STALE_MS = 15 * 60 * 1000;

export class IndexError extends Error {
  constructor(public code: "already-indexing" | "no-repository" | "failed", message: string) { super(message); }
}

async function insertBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

/** Writes a built index, replacing any previous index for the repository. */
export async function persistIndex(repositoryId: string, built: BuiltIndex, commits: CommitData[]) {
  await db.repoFile.deleteMany({ where: { repositoryId } }); // cascades symbols
  await db.codeChunk.deleteMany({ where: { repositoryId } });
  await db.repoCommit.deleteMany({ where: { repositoryId } });

  const fileIds = new Map<string, string>();
  const fileRows = built.files.map((f) => {
    const id = randomUUID();
    fileIds.set(f.path, id);
    return { id, repositoryId, path: f.path, language: f.language, category: f.category, isTest: f.isTest, size: f.size, lineCount: f.lineCount, sha: f.sha, imports: f.imports, exports: f.exports };
  });
  await insertBatches(fileRows, (data) => db.repoFile.createMany({ data }));

  const symbolRows = built.files.flatMap((f) =>
    f.symbols.map((s) => ({ repositoryId, fileId: fileIds.get(f.path)!, name: s.name.slice(0, 300), kind: s.kind, parent: s.parent ?? null, lineStart: s.lineStart, lineEnd: s.lineEnd, exported: s.exported, signature: s.signature, meta: s.meta ?? Prisma.JsonNull })),
  );
  await insertBatches(symbolRows, (data) => db.repoSymbol.createMany({ data }));

  const chunkRows = built.chunks.map((c) => ({ repositoryId, filePath: c.filePath, startLine: c.lineStart, endLine: c.lineEnd, language: c.language, symbol: c.symbol, kind: c.kind, branch: built.branch, commitSha: built.commitSha, imports: c.imports, content: c.content, contentHash: c.contentHash }));
  await insertBatches(chunkRows, (data) => db.codeChunk.createMany({ data }));

  await insertBatches(commits, (batch) => db.repoCommit.createMany({ data: batch.map((c) => ({ repositoryId, sha: c.sha, message: c.message, authorName: c.authorName, authoredAt: c.authoredAt, files: c.files })), skipDuplicates: true }));
}

/**
 * Full ingestion for one project. The caller MUST have verified project ownership
 * (the route handler does, via findOwnedProject). Only one index run per repository at a time.
 */
export async function indexRepository(repositoryId: string, branch: string): Promise<void> {
  const repo = await db.repository.findUnique({ where: { id: repositoryId } });
  if (!repo) throw new IndexError("no-repository", "Repository not found");

  const claimed = await db.repository.updateMany({
    where: { id: repositoryId, OR: [{ indexStatus: { not: "INDEXING" } }, { updatedAt: { lt: new Date(Date.now() - STALE_MS) } }] },
    data: { indexStatus: "INDEXING", indexError: null, indexProgress: { stage: "Starting", startedAt: new Date().toISOString() } },
  });
  if (claimed.count === 0) throw new IndexError("already-indexing", "This repository is already being indexed");

  const progress = (stage: string, detail?: string) =>
    db.repository.update({ where: { id: repositoryId }, data: { indexProgress: { stage, detail: detail ?? null, at: new Date().toISOString() } } }).catch(() => undefined);

  const ref: RepoRef = { installationId: Number(repo.githubInstallationId), owner: repo.owner, repo: repo.name, branch };
  const started = Date.now();
  try {
    await progress("Reading repository", `branch ${branch}`);
    const head = await resolveBranchHead(ref);
    const source = await githubSource(ref, head);

    const built = await buildIndex(source, { onProgress: (s, d) => void progress(s, d) });
    await progress("Reading git history");
    const commits = await fetchCommits(ref, head);

    await progress("Saving index", `${built.stats.chunks} chunks, ${built.stats.symbols} symbols`);
    await persistIndex(repositoryId, built, commits);

    const a = built.analysis;
    await db.repository.update({
      where: { id: repositoryId },
      data: {
        indexStatus: "INDEXED", indexProgress: Prisma.JsonNull, indexError: null, lastIndexedAt: new Date(), lastIndexedSha: head, indexedBranch: branch,
        analysis: a as unknown as Prisma.InputJsonValue, indexStats: built.stats as unknown as Prisma.InputJsonValue,
        language: a.languages[0]?.language ?? repo.language, framework: a.frameworks.slice(0, 3).join(", ") || null,
      },
    });
    log.info("repo.index.ok", { repositoryId, files: built.stats.filesIndexed, chunks: built.stats.chunks, ms: Date.now() - started });
  } catch (e) {
    // Store a safe message (no tokens / URLs with credentials) for the UI; details go to the structured log.
    const message = e instanceof Error ? e.message.replace(/gh[pousr]_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300) : "Unknown error";
    log.error("repo.index.failed", { repositoryId, error: message });
    await db.repository.update({ where: { id: repositoryId }, data: { indexStatus: "FAILED", indexProgress: Prisma.JsonNull, indexError: message } });
    throw new IndexError("failed", message);
  }
}
