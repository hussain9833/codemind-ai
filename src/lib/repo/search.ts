import { buildImportGraph, packageName, type ImportGraph } from "./graph";
import { parseQuery, words, type ParsedQuery } from "./query";
import type { CommitData, DependencyInfo, IndexedFile, RepoIndexReader, SymbolRow, TextHit } from "./types";

/** Short terms ("auth", "db") must match whole words so "auth" does not hit "author". */
const LONG = 5;

export interface FileMatch { file: IndexedFile; score: number; reason: string }
export interface SymbolMatch { symbol: SymbolRow; score: number; reason: string }
export interface CommitMatch { commit: CommitData; score: number; reason: string; recency: number }
export interface DependencyMatch { dependency: DependencyInfo; score: number; users: string[]; reason: string }
export interface CodeMatch { filePath: string; line: number; text: string; term: string }

/** Deterministic search over a loaded index. Metadata is held in memory; source text is searched through the reader. */
export class RepoSearch {
  private constructor(
    readonly files: IndexedFile[],
    readonly symbols: SymbolRow[],
    readonly commits: CommitData[],
    readonly dependencies: DependencyInfo[],
    readonly graph: ImportGraph,
    private reader: RepoIndexReader,
  ) {}

  static async load(reader: RepoIndexReader): Promise<RepoSearch> {
    const [files, symbols, commits, analysis] = await Promise.all([reader.files(), reader.symbols(), reader.commits(), reader.analysis()]);
    return new RepoSearch(files, symbols, commits, analysis?.dependencies ?? [], buildImportGraph(files), reader);
  }

  // ── File search ──
  searchFiles(q: ParsedQuery, limit = 50): FileMatch[] {
    const out: FileMatch[] = [];
    for (const file of this.files) {
      const lower = file.path.toLowerCase();
      const base = lower.split("/").pop()!;
      const stem = base.replace(/\.[^.]+$/, "");
      const parts = new Set(words(file.path));
      let score = 0;
      let reason = "";
      for (const p of q.paths) {
        const pl = p.toLowerCase();
        if (lower === pl) { score += 12; reason = "exact path"; }
        else if (lower.endsWith(`/${pl}`) || base === pl) { score += 10; reason = "file name"; }
        else if (lower.includes(pl)) { score += 6; reason = "path contains"; }
      }
      for (const { term, weight } of q.terms) {
        let s = 0;
        if (stem === term) s = 6;
        else if (parts.has(term)) s = 4;
        else if (term.length >= LONG && stem.includes(term)) s = 3;
        else if (term.length >= LONG && lower.includes(term)) s = 1.5;
        if (s) { score += s * weight; reason ||= stem === term ? "file name" : "path"; }
      }
      if (score > 0) out.push({ file, score, reason });
    }
    return out.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path)).slice(0, limit);
  }

  // ── Symbol search ──
  searchSymbols(q: ParsedQuery, limit = 50): SymbolMatch[] {
    const out: SymbolMatch[] = [];
    const ids = new Set(q.identifiers.map((i) => i.toLowerCase()));
    for (const symbol of this.symbols) {
      const name = symbol.name.toLowerCase();
      const parts = new Set(words(symbol.name));
      let score = 0;
      let reason = "";
      if (ids.has(name)) { score += 14; reason = "exact symbol"; }
      for (const { term, weight } of q.terms) {
        let s = 0;
        if (name === term) s = 9;
        else if (parts.has(term)) s = 5;
        else if (term.length >= LONG && name.startsWith(term)) s = 4;
        else if (term.length >= LONG && name.includes(term)) s = 2.5;
        if (s) { score += s * weight; reason ||= name === term ? "symbol name" : "symbol name part"; }
      }
      if (score > 0) {
        if (symbol.exported) score *= 1.15;
        if (symbol.kind === "method") score *= 0.8;
        out.push({ symbol, score, reason });
      }
    }
    return out.sort((a, b) => b.score - a.score || a.symbol.filePath.localeCompare(b.symbol.filePath) || a.symbol.lineStart - b.symbol.lineStart).slice(0, limit);
  }

  // ── Exact source-text search ──
  async searchCode(q: ParsedQuery, limit = 200): Promise<CodeMatch[]> {
    const wanted = new Map<string, number>();
    for (const p of q.phrases) wanted.set(p, 2);
    for (const i of q.identifiers) wanted.set(i.toLowerCase(), 2);
    for (const { term, weight } of q.terms) if (term.length >= 3 && !wanted.has(term)) wanted.set(term, weight);
    const hits: CodeMatch[] = [];
    const seen = new Set<string>();
    // High-weight terms first; stop once there are enough hits.
    for (const [term] of [...wanted].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
      const rows: TextHit[] = await this.reader.searchText(term, Math.ceil(limit / 2));
      const short = term.length < LONG && !q.identifiers.some((i) => i.toLowerCase() === term);
      for (const r of rows) {
        if (short && !words(r.text).includes(term)) continue;
        const key = `${r.filePath}:${r.line}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        hits.push({ ...r, term });
      }
      if (hits.length >= limit * 2) break;
    }
    return hits;
  }

  // ── Dependency search ──
  searchDependencies(q: ParsedQuery, limit = 20): DependencyMatch[] {
    const out: DependencyMatch[] = [];
    for (const dep of this.dependencies) {
      const name = dep.name.toLowerCase();
      const parts = new Set(words(dep.name));
      let score = 0;
      for (const { term, weight } of q.terms) {
        if (name === term) score += 8 * weight;
        else if (parts.has(term)) score += 4 * weight;
        else if (term.length >= LONG && name.includes(term)) score += 2 * weight;
      }
      if (score > 0) out.push({ dependency: dep, score, users: this.graph.packageUsers.get(dep.name) ?? this.graph.packageUsers.get(packageName(dep.name)) ?? [], reason: "package name" });
    }
    return out.sort((a, b) => b.score - a.score || a.dependency.name.localeCompare(b.dependency.name)).slice(0, limit);
  }

  /** Internal module relationships for a file. */
  relationships(path: string) {
    return { imports: this.graph.imports.get(path) ?? [], importedBy: this.graph.importedBy.get(path) ?? [] };
  }

  // ── Git search ──
  searchGit(q: ParsedQuery, limit = 30): CommitMatch[] {
    const out: CommitMatch[] = [];
    const total = this.commits.length || 1;
    this.commits.forEach((commit, idx) => {
      const msg = commit.message.toLowerCase();
      const msgWords = new Set(words(commit.message));
      let score = 0;
      let reason = "";
      for (const sha of q.shas) if (commit.sha.startsWith(sha)) { score += 20; reason = "commit hash"; }
      for (const p of q.phrases) if (msg.includes(p)) { score += 6; reason ||= "commit message"; }
      for (const { term, weight } of q.terms) {
        if (msgWords.has(term)) { score += 3 * weight; reason ||= "commit message"; }
        else if (msg.includes(term)) { score += 1.5 * weight; reason ||= "commit message"; }
      }
      const fileHits = commit.files.filter((f) => { const fl = f.toLowerCase(); return q.terms.some((t) => t.weight >= 0.8 && fl.includes(t.term)) || q.paths.some((p) => fl.includes(p.toLowerCase())); });
      if (fileHits.length) { score += Math.min(fileHits.length, 4) * 1.5; reason ||= "changed files"; }
      if (score > 0) out.push({ commit, score, reason, recency: 1 - idx / total });
    });
    return out.sort((a, b) => b.score - a.score || b.commit.authoredAt.getTime() - a.commit.authoredAt.getTime()).slice(0, limit);
  }

  /** Commits that touched a file, newest first. */
  commitsForFile(path: string, limit = 10): CommitData[] {
    return this.commits.filter((c) => c.files.includes(path)).slice(0, limit);
  }

  static parse = parseQuery;
}
