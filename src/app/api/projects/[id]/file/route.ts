import { json, authorizeProjectRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { installationOctokit } from "@/lib/github";
import { log } from "@/lib/log";
import { monacoLanguage } from "@/lib/repo/languages";

export const dynamic = "force-dynamic";

/**
 * File contents + metadata. Only paths present in the project's index can be requested
 * (so secret/ignored files and arbitrary paths are never served), and content is fetched
 * from GitHub at the exact indexed commit.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  const repo = a.repository;
  const path = new URL(req.url).searchParams.get("path");
  if (!repo || !path) return json({ error: "path is required" }, { status: 400 });
  if (!repo.lastIndexedSha) return json({ error: "Repository has not been indexed yet" }, { status: 409 });

  const file = await db.repoFile.findUnique({ where: { repositoryId_path: { repositoryId: repo.id, path } }, include: { symbols: { orderBy: { lineStart: "asc" } } } });
  if (!file) return json({ error: "File is not part of the index" }, { status: 404 });

  let content: string;
  try {
    const oct = await installationOctokit(Number(repo.githubInstallationId));
    const res = await oct.request("GET /repos/{owner}/{repo}/contents/{path}", { owner: repo.owner, repo: repo.name, path, ref: repo.lastIndexedSha, headers: { accept: "application/vnd.github.raw+json" } });
    content = typeof res.data === "string" ? res.data : String(res.data);
  } catch (e) {
    log.warn("repo.file.fetch_failed", { repositoryId: repo.id, path, status: (e as { status?: number }).status });
    return json({ error: "GitHub could not return this file right now" }, { status: 502 });
  }

  const commits = await db.repoCommit.findMany({ where: { repositoryId: repo.id, files: { has: path } }, orderBy: { authoredAt: "desc" }, take: 8, select: { sha: true, message: true, authorName: true, authoredAt: true } });

  return json({
    path, content, language: monacoLanguage(path), commitSha: repo.lastIndexedSha,
    meta: { size: file.size, lines: file.lineCount, category: file.category, imports: file.imports, exports: file.exports },
    symbols: file.symbols.map((s) => ({ name: s.name, kind: s.kind, parent: s.parent, lineStart: s.lineStart, lineEnd: s.lineEnd, exported: s.exported })),
    commits,
  }, { headers: { "Cache-Control": "private, max-age=300" } });
}
