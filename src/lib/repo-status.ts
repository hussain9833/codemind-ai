import "server-only";
import { db } from "./db";
import type { RepoAnalysis } from "./repo/types";

/** Repository index state for the UI. Caller must have authorized the project. */
export async function getRepoState(repositoryId: string) {
  const r = await db.repository.findUnique({
    where: { id: repositoryId },
    select: { indexStatus: true, indexProgress: true, indexError: true, lastIndexedAt: true, analysis: true, indexStats: true, lastIndexedSha: true, indexedBranch: true },
  });
  if (!r) return null;
  return {
    status: {
      indexStatus: r.indexStatus,
      indexProgress: (r.indexProgress as { stage?: string; detail?: string | null } | null) ?? null,
      indexError: r.indexError,
      lastIndexedAt: r.lastIndexedAt?.toISOString() ?? null,
    },
    analysis: (r.analysis as unknown as RepoAnalysis | null) ?? null,
    stats: r.indexStats as { filesIndexed: number; filesSkipped: number; symbols: number; chunks: number; durationMs: number; skippedReasons: Record<string, number> } | null,
    sha: r.lastIndexedSha,
    branch: r.indexedBranch,
  };
}
