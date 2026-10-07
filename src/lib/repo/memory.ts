import type { BuiltIndex, CommitData, IndexedFile, RepoAnalysis, RepoIndexReader, SymbolRow, TextHit } from "./types";

/** In-memory RepoIndexReader over a BuiltIndex (tests and local verification). */
export function memoryReader(index: BuiltIndex, commits: CommitData[] = []): RepoIndexReader {
  const files: IndexedFile[] = index.files;
  return {
    async files() { return files; },
    async symbols(): Promise<SymbolRow[]> { return files.flatMap((f) => f.symbols.map((s) => ({ ...s, filePath: f.path }))); },
    async commits() { return commits; },
    async analysis(): Promise<RepoAnalysis> { return index.analysis; },
    async searchText(term, limit): Promise<TextHit[]> {
      const t = term.toLowerCase();
      const out: TextHit[] = [];
      const seen = new Set<string>();
      for (const c of index.chunks) {
        const lines = c.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]!.toLowerCase().includes(t)) {
            const line = c.lineStart + i;
            const key = `${c.filePath}:${line}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ filePath: c.filePath, line, text: lines[i]!.trim().slice(0, 240) });
            if (out.length >= limit) return out;
          }
        }
      }
      return out;
    },
  };
}
