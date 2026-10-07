import { json, authorizeProjectRequest } from "@/lib/api-auth";
import { dbReader } from "@/lib/repo/db-reader";
import { findEvidence } from "@/lib/repo/evidence";
import { parseQuery } from "@/lib/repo/query";
import { RepoSearch } from "@/lib/repo/search";

export const dynamic = "force-dynamic";

type Mode = "evidence" | "files" | "symbols" | "code" | "dependencies" | "git";
const MODES = new Set<Mode>(["evidence", "files", "symbols", "code", "dependencies", "git"]);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  if (!a.repository || a.repository.indexStatus !== "INDEXED") return json({ error: "Repository is not indexed yet", code: "not-indexed" }, { status: 409 });

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 300);
  const mode = (sp.get("mode") ?? "evidence") as Mode;
  if (!q) return json({ error: "q is required" }, { status: 400 });
  if (!MODES.has(mode)) return json({ error: "Unknown mode" }, { status: 400 });

  const reader = dbReader(a.repository.id);
  if (mode === "evidence") {
    const { query, evidence } = await findEvidence(reader, q, { limit: 40 });
    return json({ mode, terms: query.terms.map((t) => ({ term: t.term, origin: t.origin })), evidence });
  }
  const search = await RepoSearch.load(reader);
  const pq = parseQuery(q);
  switch (mode) {
    case "files": return json({ mode, results: search.searchFiles(pq).map((m) => ({ path: m.file.path, language: m.file.language, score: m.score, reason: m.reason })) });
    case "symbols": return json({ mode, results: search.searchSymbols(pq).map((m) => ({ name: m.symbol.name, kind: m.symbol.kind, parent: m.symbol.parent, filePath: m.symbol.filePath, lineStart: m.symbol.lineStart, lineEnd: m.symbol.lineEnd, signature: m.symbol.signature, score: m.score })) });
    case "code": return json({ mode, results: (await search.searchCode(pq, 100)).map((h) => ({ filePath: h.filePath, line: h.line, text: h.text })) });
    case "dependencies": return json({ mode, results: search.searchDependencies(pq).map((d) => ({ name: d.dependency.name, version: d.dependency.version, dev: d.dependency.dev, users: d.users.slice(0, 20), score: d.score })) });
    case "git": return json({ mode, results: search.searchGit(pq).map((g) => ({ sha: g.commit.sha, message: g.commit.message.split("\n")[0], author: g.commit.authorName, date: g.commit.authoredAt, files: g.commit.files.slice(0, 10), reason: g.reason, score: g.score })) });
  }
}
