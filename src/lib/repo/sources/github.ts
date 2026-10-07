import "server-only";
import { Readable } from "node:stream";
import { installationOctokit, installationToken } from "@/lib/github";
import { MAX_ARCHIVE_BYTES, tarballSource } from "./tarball";
import type { CommitData, FileSource } from "../types";

export interface RepoRef { installationId: number; owner: string; repo: string; branch: string }

/** Latest commit SHA of a branch. Pinning the SHA keeps the whole index internally consistent. */
export async function resolveBranchHead({ installationId, owner, repo, branch }: RepoRef): Promise<string> {
  const oct = await installationOctokit(installationId);
  const { data } = await oct.rest.repos.getBranch({ owner, repo, branch });
  return data.commit.sha;
}

/**
 * Downloads the repository as ONE tarball at a pinned commit (instead of one API call per file),
 * streams it through gunzip + tar, and keeps only text-sized files that survive the cheap path filter.
 */
export async function githubSource(ref: RepoRef, commitSha: string): Promise<FileSource> {
  const token = await installationToken(ref.installationId);
  const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/tarball/${commitSha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "codemind-ai" },
    redirect: "follow",
  });
  if (!res.ok || !res.body) throw new Error(`GitHub tarball download failed (${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_ARCHIVE_BYTES) throw new Error("Repository archive is too large to index");

  return tarballSource(Readable.fromWeb(res.body as never), commitSha, ref.branch);
}

/** Recent commit history (messages + changed files for the newest commits). */
export async function fetchCommits(ref: RepoRef, headSha: string, limit = 100, detailed = 40): Promise<CommitData[]> {
  const oct = await installationOctokit(ref.installationId);
  const { data } = await oct.rest.repos.listCommits({ owner: ref.owner, repo: ref.repo, sha: headSha, per_page: Math.min(limit, 100) });
  const out: CommitData[] = data.map((c) => ({ sha: c.sha, message: c.commit.message.slice(0, 500), authorName: c.commit.author?.name ?? c.author?.login ?? "unknown", authoredAt: new Date(c.commit.author?.date ?? Date.now()), files: [] }));

  // Changed files need one request per commit: fetch for the newest N with small concurrency.
  const queue = out.slice(0, detailed);
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < queue.length) {
      const c = queue[i++]!;
      try {
        const { data: full } = await oct.rest.repos.getCommit({ owner: ref.owner, repo: ref.repo, ref: c.sha });
        c.files = (full.files ?? []).map((f) => f.filename).slice(0, 300);
      } catch { /* a missing detail must not fail indexing */ }
    }
  }));
  return out;
}
