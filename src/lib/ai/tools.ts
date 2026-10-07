import "server-only";
import { db } from "@/lib/db";
import { dbReader } from "@/lib/repo/db-reader";
import { parseQuery } from "@/lib/repo/query";
import { RepoSearch } from "@/lib/repo/search";
import type { TrackedProvider } from "./execution";
import { redactSecrets } from "./redact";
import { retrieveContext, type ContextItem } from "./retrieval";

/**
 * Deterministic investigation tools. Each returns located evidence (ContextItem) plus a
 * one-line summary for the timeline. None of them calls an LLM except searchRepository's
 * optional vector leg (embedding the query); nothing here can invent a result.
 */

export const TOOL_NAMES = ["searchRepository", "searchCode", "findSymbol", "getDependencies", "getGitHistory", "getCommit", "readFile", "searchIncidents", "searchDocumentation"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolContext {
  repositoryId: string;
  projectId: string;
  search: RepoSearch;
  ai: TrackedProvider | null;
}

export interface ToolResult { items: Omit<ContextItem, "ref">[]; summary: string; /** non-evidence findings, e.g. similar incidents */ notes?: string[] }

const SNIPPET = 2000;
const strip = (c: Omit<ContextItem, "ref">) => c;

export async function createToolContext(repositoryId: string, projectId: string, ai: TrackedProvider | null): Promise<ToolContext> {
  return { repositoryId, projectId, ai, search: await RepoSearch.load(dbReader(repositoryId)) };
}

/** Lines [start, end] of a file, rebuilt from the stored chunks (windowed to keep prompts small). */
export async function readLines(ctx: ToolContext, path: string, start = 1, end = start + 79): Promise<{ text: string; start: number; end: number } | null> {
  end = Math.min(end, start + 119);
  const chunks = await db.codeChunk.findMany({ where: { repositoryId: ctx.repositoryId, filePath: path, endLine: { gte: start }, startLine: { lte: end } }, orderBy: { startLine: "asc" }, select: { startLine: true, content: true } });
  if (!chunks.length) return null;
  const lines = new Map<number, string>();
  for (const c of chunks) c.content.split("\n").forEach((l, i) => lines.set(c.startLine + i, l));
  const out: string[] = [];
  let first = -1, last = -1;
  for (let n = start; n <= end; n++) {
    const l = lines.get(n);
    if (l === undefined) continue;
    if (first < 0) first = n;
    last = n;
    out.push(l);
  }
  return out.length ? { text: redactSecrets(out.join("\n")).slice(0, 6000), start: first, end: last } : null;
}

async function chunkText(ctx: ToolContext, path: string, line?: number) {
  const r = await readLines(ctx, path, Math.max(1, (line ?? 1) - 3), (line ?? 1) + 40);
  return r;
}

export const TOOLS: Record<ToolName, (ctx: ToolContext, input: string) => Promise<ToolResult>> = {
  /** Hybrid retrieval (exact/symbol/file/dependency/git + vectors). */
  async searchRepository(ctx, input) {
    const r = await retrieveContext(ctx.repositoryId, input, ctx.ai, { maxFiles: 5, totalChars: 12_000 });
    return { items: r.items.map(({ ref: _ref, ...rest }) => { void _ref; return rest; }), summary: `${r.items.length} evidence items${r.usedVector ? " (incl. semantic search)" : ""}`, notes: r.notes };
  },

  async searchCode(ctx, input) {
    const hits = await ctx.search.searchCode(parseQuery(input), 60);
    const byFile = new Map<string, typeof hits>();
    for (const h of hits) (byFile.get(h.filePath) ?? byFile.set(h.filePath, []).get(h.filePath)!).push(h);
    const items: ToolResult["items"] = [];
    for (const [file, hs] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5)) {
      const line = hs[0]!.line;
      const t = await chunkText(ctx, file, line);
      if (t) items.push(strip({ kind: "LINE", title: `${file}:${line}`, filePath: file, lineStart: t.start, lineEnd: t.end, text: t.text.slice(0, SNIPPET), reasons: [`${hs.length} exact text match${hs.length > 1 ? "es" : ""}`], score: hs.length }));
    }
    return { items, summary: `${hits.length} text matches in ${byFile.size} files` };
  },

  async findSymbol(ctx, input) {
    const matches = ctx.search.searchSymbols(parseQuery(input), 6);
    const items: ToolResult["items"] = [];
    for (const m of matches.slice(0, 4)) {
      const t = await readLines(ctx, m.symbol.filePath, m.symbol.lineStart, Math.min(m.symbol.lineEnd, m.symbol.lineStart + 59));
      if (t) items.push(strip({ kind: "SYMBOL", title: `${m.symbol.kind} ${m.symbol.parent ? m.symbol.parent + "." : ""}${m.symbol.name}`, filePath: m.symbol.filePath, lineStart: t.start, lineEnd: t.end, symbol: m.symbol.name, text: t.text.slice(0, SNIPPET), reasons: [m.reason], score: m.score }));
    }
    return { items, summary: `${matches.length} symbols matched` };
  },

  async getDependencies(ctx, input) {
    const deps = ctx.search.searchDependencies(parseQuery(input), 5);
    const items = deps.map((d) => strip({ kind: "DEPENDENCY", title: `${d.dependency.name}@${d.dependency.version}`, dependency: d.dependency.name, text: `${d.dependency.name}@${d.dependency.version}${d.dependency.dev ? " (dev)" : ""}\nImported by: ${d.users.slice(0, 8).join(", ") || "no indexed file imports it"}`, reasons: [d.reason, `used by ${d.users.length} files`], score: d.score }));
    return { items, summary: `${deps.length} dependencies matched` };
  },

  /** Input: a file path (history of that file) or a text query (commit messages / changed files). */
  async getGitHistory(ctx, input) {
    const isPath = /[\\/]/.test(input) && ctx.search.files.some((f) => f.path === input);
    const commits = isPath ? ctx.search.commitsForFile(input, 6).map((c) => ({ commit: c, score: 5, reason: "touched this file" })) : ctx.search.searchGit(parseQuery(input), 6).map((g) => ({ commit: g.commit, score: g.score, reason: `matches ${g.reason}` }));
    const items = commits.map((c) => strip({ kind: "COMMIT", title: `${c.commit.sha.slice(0, 7)} ${c.commit.message.split("\n")[0]}`, commitSha: c.commit.sha, text: `${c.commit.sha.slice(0, 10)} ${c.commit.authoredAt.toISOString().slice(0, 10)} by ${c.commit.authorName}\n${c.commit.message.slice(0, 400)}\nFiles: ${c.commit.files.slice(0, 12).join(", ") || "(not recorded)"}`, reasons: [c.reason], score: c.score }));
    return { items, summary: `${commits.length} commits` };
  },

  async getCommit(ctx, input) {
    const sha = input.trim().toLowerCase();
    const c = ctx.search.commits.find((x) => x.sha.startsWith(sha));
    if (!c) return { items: [], summary: "commit not found in indexed history" };
    return { items: [strip({ kind: "COMMIT", title: `${c.sha.slice(0, 7)} ${c.message.split("\n")[0]}`, commitSha: c.sha, text: `${c.sha}\n${c.authoredAt.toISOString()} by ${c.authorName}\n${c.message.slice(0, 600)}\nFiles: ${c.files.slice(0, 30).join(", ")}`, reasons: ["requested commit"], score: 6 })], summary: "1 commit" };
  },

  /** Input: "path" or "path:start-end". */
  async readFile(ctx, input) {
    const m = input.match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/);
    const path = m?.[1] ?? input;
    if (!ctx.search.files.some((f) => f.path === path)) return { items: [], summary: `${path} is not in the index` };
    const t = await readLines(ctx, path, m?.[2] ? Number(m[2]) : 1, m?.[3] ? Number(m[3]) : undefined);
    if (!t) return { items: [], summary: "no content" };
    return { items: [strip({ kind: "LINE", title: `${path}:${t.start}`, filePath: path, lineStart: t.start, lineEnd: t.end, text: t.text, reasons: ["file read"], score: 4 })], summary: `lines ${t.start}-${t.end}` };
  },

  /** Similar past incidents/investigations in this project. Supporting context only — never evidence. */
  async searchIncidents(ctx, input) {
    const terms = parseQuery(input).terms.filter((t) => t.weight >= 0.8).slice(0, 4).map((t) => t.term);
    if (!terms.length) return { items: [], summary: "no searchable terms" };
    const or = terms.map((t) => ({ title: { contains: t, mode: "insensitive" as const } }));
    const [incidents, past] = await Promise.all([
      db.incident.findMany({ where: { projectId: ctx.projectId, OR: or }, take: 3, select: { title: true, status: true } }),
      db.investigation.findMany({ where: { projectId: ctx.projectId, OR: or, rootCause: { not: null } }, take: 3, select: { title: true, rootCause: true } }),
    ]);
    return { items: [], summary: `${incidents.length} incidents, ${past.length} past investigations`, notes: [...incidents.map((i) => `Incident (${i.status}): ${i.title}`), ...past.map((p) => `Past investigation: ${p.title}`)] };
  },

  async searchDocumentation(ctx, input) {
    const r = await retrieveContext(ctx.repositoryId, input, null, { maxFiles: 6, totalChars: 8000 });
    const docs = r.items.filter((i) => i.kind === "DOCUMENTATION" || /\.(md|mdx|rst|txt)$/i.test(i.filePath ?? ""));
    return { items: docs.map(({ ref: _ref, ...rest }) => { void _ref; return { ...rest, kind: "DOCUMENTATION" as const }; }), summary: `${docs.length} documentation passages` };
  },
};
