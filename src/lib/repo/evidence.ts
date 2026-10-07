import { createHash } from "node:crypto";
import { parseQuery, type ParsedQuery } from "./query";
import { RepoSearch } from "./search";
import type { EvidenceItem, EvidenceKind, IndexedFile, RepoIndexReader } from "./types";

/**
 * Deterministic evidence engine. Combines exact text, symbol, file, dependency and git
 * signals into ranked, locatable evidence. No LLM is involved. Every item carries the
 * reasons it was selected so the ranking is explainable.
 */

export interface EvidenceOptions { limit?: number; kinds?: EvidenceKind[] }

const W = { symbolExact: 1, textHit: 1.6, relation: 3, test: 2.2, recency: 2 };

const evId = (...parts: (string | number | undefined)[]) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);

interface FileAcc { file: IndexedFile; score: number; reasons: Set<string>; hitLines: { line: number; text: string }[] }

export async function findEvidence(reader: RepoIndexReader, query: string, opts: EvidenceOptions = {}): Promise<{ query: ParsedQuery; evidence: EvidenceItem[] }> {
  const q = parseQuery(query);
  const limit = opts.limit ?? 30;
  const search = await RepoSearch.load(reader);
  if (!q.terms.length && !q.paths.length && !q.shas.length) return { query: q, evidence: [] };

  const acc = new Map<string, FileAcc>();
  const touch = (path: string): FileAcc | null => {
    let a = acc.get(path);
    if (!a) {
      const file = search.files.find((f) => f.path === path);
      if (!file) return null;
      a = { file, score: 0, reasons: new Set(), hitLines: [] };
      acc.set(path, a);
    }
    return a;
  };

  const items: EvidenceItem[] = [];

  // 1. File / path relevance
  for (const m of search.searchFiles(q)) {
    const a = touch(m.file.path);
    if (a) { a.score += m.score; a.reasons.add(`${m.reason} matches query`); }
  }

  // 2. Symbols
  const symbolMatches = search.searchSymbols(q);
  for (const m of symbolMatches) {
    const a = touch(m.symbol.filePath);
    if (a) { a.score += m.score * 0.5; a.reasons.add(`defines ${m.symbol.kind} ${m.symbol.name}`); }
    items.push({
      id: evId("sym", m.symbol.filePath, m.symbol.name, m.symbol.lineStart),
      kind: "SYMBOL", title: `${m.symbol.kind} ${m.symbol.parent ? m.symbol.parent + "." : ""}${m.symbol.name}`,
      filePath: m.symbol.filePath, lineStart: m.symbol.lineStart, lineEnd: m.symbol.lineEnd, symbol: m.symbol.name,
      excerpt: m.symbol.signature, reasons: [`${m.reason}`, ...(m.symbol.exported ? ["exported"] : [])], score: m.score * W.symbolExact,
    });
  }

  // 3. Exact source text
  const code = await search.searchCode(q);
  const byFile = new Map<string, typeof code>();
  for (const c of code) (byFile.get(c.filePath) ?? byFile.set(c.filePath, []).get(c.filePath)!).push(c);
  for (const [path, hits] of byFile) {
    const a = touch(path);
    if (!a) continue;
    const terms = new Set(hits.map((h) => h.term));
    a.score += Math.min(Math.log2(hits.length + 1) * 2, 7) * W.textHit * 0.6 + terms.size * 0.8;
    a.reasons.add(`${hits.length} text match${hits.length > 1 ? "es" : ""} (${[...terms].slice(0, 4).join(", ")})`);
    a.hitLines.push(...hits.map((h) => ({ line: h.line, text: h.text })));
  }

  // 4. Dependency relationships
  const depMatches = search.searchDependencies(q);
  for (const d of depMatches) {
    items.push({ id: evId("dep", d.dependency.name), kind: "DEPENDENCY", title: `${d.dependency.name}@${d.dependency.version}${d.dependency.dev ? " (dev)" : ""}`, dependency: d.dependency.name, excerpt: d.users.length ? `Imported by ${d.users.slice(0, 5).join(", ")}${d.users.length > 5 ? ` +${d.users.length - 5} more` : ""}` : "Declared dependency, no imports found in indexed files", reasons: [d.reason, ...(d.users.length ? [`used by ${d.users.length} files`] : [])], score: d.score * 1.1 });
    for (const u of d.users) { const a = touch(u); if (a) { a.score += W.relation * Math.min(d.score / 8, 1); a.reasons.add(`imports ${d.dependency.name}`); } }
  }

  // 5. Import-graph relation to the strongest files
  const seeds = [...acc.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  for (const s of seeds) {
    const rel = search.relationships(s.file.path);
    for (const p of rel.imports) { const a = touch(p); if (a && a !== s) { a.score += W.relation * 0.5; a.reasons.add(`imported by ${s.file.path.split("/").pop()}`); } }
    for (const p of rel.importedBy) { const a = touch(p); if (a && a !== s) { a.score += W.relation * 0.5; a.reasons.add(`imports ${s.file.path.split("/").pop()}`); } }
  }

  // 6. Git
  const gitMatches = search.searchGit(q);
  const touchedByGit = new Map<string, number>();
  for (const g of gitMatches) {
    items.push({ id: evId("commit", g.commit.sha), kind: "COMMIT", title: `${g.commit.sha.slice(0, 7)} ${g.commit.message.split("\n")[0]}`, commitSha: g.commit.sha, excerpt: `${g.commit.authorName} · ${g.commit.authoredAt.toISOString().slice(0, 10)}${g.commit.files.length ? ` · ${g.commit.files.length} files` : ""}`, reasons: [`matches ${g.reason}`, ...(g.recency > 0.8 ? ["recent"] : [])], score: g.score * 0.9 + g.recency * W.recency });
    for (const f of g.commit.files) touchedByGit.set(f, Math.max(touchedByGit.get(f) ?? 0, g.recency));
  }
  for (const [path, rec] of touchedByGit) { const a = acc.get(path); if (a) { a.score += rec * W.recency; a.reasons.add("changed in a matching commit"); } }
  // Recency for any file already relevant: a recently changed relevant file is a stronger lead.
  for (const a of acc.values()) {
    const idx = search.commits.findIndex((c) => c.files.includes(a.file.path));
    if (idx >= 0 && a.score > 3) { const rec = 1 - idx / Math.max(search.commits.length, 1); a.score += rec * W.recency * 0.5; if (rec > 0.8) a.reasons.add("recently changed"); }
  }

  // 7. Tests linked to relevant source
  const topSource = [...acc.values()].filter((a) => !a.file.isTest && a.file.category === "source").sort((a, b) => b.score - a.score).slice(0, 8);
  for (const test of search.files.filter((f) => f.isTest)) {
    const stem = test.path.split("/").pop()!.replace(/\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|^test_|\.[a-z]+$/g, "").toLowerCase();
    for (const s of topSource) {
      const sStem = s.file.path.split("/").pop()!.replace(/\.[a-z]+$/, "").toLowerCase();
      const imports = search.graph.imports.get(test.path)?.includes(s.file.path);
      if (imports || (stem && stem === sStem)) {
        const a = touch(test.path)!;
        a.score += W.test * Math.min(s.score / 6, 2);
        a.reasons.add(`tests ${s.file.path}`);
        break;
      }
    }
  }

  // 8. Turn file accumulators into FILE / LINE / TEST / DOCUMENTATION evidence
  for (const a of acc.values()) {
    if (a.score < 1) continue;
    const kind: EvidenceKind = a.file.isTest ? "TEST" : a.file.category === "docs" ? "DOCUMENTATION" : "FILE";
    const first = a.hitLines.length ? a.hitLines.reduce((m, h) => Math.min(m, h.line), Infinity) : undefined;
    items.push({ id: evId("file", a.file.path), kind, title: a.file.path, filePath: a.file.path, lineStart: first, lineEnd: first, reasons: [...a.reasons].slice(0, 6), score: a.score });

    // LINE evidence: merge hits within 3 lines into ranges, keep best 2 per file.
    const sorted = [...a.hitLines].sort((x, y) => x.line - y.line);
    const ranges: { start: number; end: number; text: string; n: number }[] = [];
    for (const h of sorted) {
      const last = ranges[ranges.length - 1];
      if (last && h.line - last.end <= 3) { last.end = h.line; last.n++; last.text += `\n${h.text}`; }
      else ranges.push({ start: h.line, end: h.line, text: h.text, n: 1 });
    }
    for (const r of ranges.sort((x, y) => y.n - x.n || x.start - y.start).slice(0, 2)) {
      items.push({ id: evId("line", a.file.path, r.start, r.end), kind: "LINE", title: `${a.file.path}:${r.start}${r.end > r.start ? `–${r.end}` : ""}`, filePath: a.file.path, lineStart: r.start, lineEnd: r.end, excerpt: r.text.slice(0, 600), reasons: ["exact text match", ...(a.file.isTest ? ["in test"] : [])], score: a.score * 0.6 + r.n });
    }
  }

  const filtered = opts.kinds ? items.filter((i) => opts.kinds!.includes(i.kind)) : items;
  const ranked = filtered
    .map((i) => ({ ...i, score: Math.round(i.score * 100) / 100 }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Diversity: no more than 14 of one kind so one signal can't crowd out the rest.
  const perKind = new Map<EvidenceKind, number>();
  const evidence: EvidenceItem[] = [];
  for (const e of ranked) {
    const n = perKind.get(e.kind) ?? 0;
    if (n >= 14) continue;
    perKind.set(e.kind, n + 1);
    evidence.push(e);
    if (evidence.length >= limit) break;
  }
  return { query: q, evidence };
}
