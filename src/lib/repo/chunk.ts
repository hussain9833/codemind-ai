import { createHash } from "node:crypto";
import type { CodeChunkData, IndexedFile } from "./types";

const MAX_CHUNK_LINES = 120;
const WINDOW = 80;
const OVERLAP = 10;
const MAX_CHUNK_CHARS = 12_000;

export const hashContent = (s: string) => createHash("sha1").update(s).digest("hex");

/**
 * Syntax-aware chunking: one chunk per top-level symbol (classes are split per method),
 * big symbols are windowed, and the code between symbols (imports, constants) becomes
 * "file-part" chunks. Files with no symbols (docs, config) use line windows.
 */
export function chunkFile(file: IndexedFile, content: string): CodeChunkData[] {
  const lines = content.split("\n");
  const chunks: CodeChunkData[] = [];
  const covered = new Array<boolean>(lines.length).fill(false);

  const emit = (kind: CodeChunkData["kind"], symbol: string | null, start: number, end: number) => {
    // start/end are 1-based inclusive
    for (let s = start; s <= end; s += MAX_CHUNK_LINES - OVERLAP) {
      const e = Math.min(end, s + MAX_CHUNK_LINES - 1);
      const text = lines.slice(s - 1, e).join("\n").slice(0, MAX_CHUNK_CHARS);
      if (text.trim()) chunks.push({ filePath: file.path, language: file.language, kind, symbol, lineStart: s, lineEnd: e, content: text, contentHash: hashContent(`${file.path}:${s}:${text}`), imports: file.imports });
      if (e >= end) break;
    }
  };

  const classes = new Set(file.symbols.filter((s) => s.kind === "class" && file.symbols.some((m) => m.parent === s.name)).map((s) => s.name));
  const top = file.symbols.filter((s) => !s.parent && s.kind !== "variable" && !classes.has(s.name));
  const methods = file.symbols.filter((s) => s.parent);

  for (const s of [...top, ...methods]) {
    emit("symbol", s.parent ? `${s.parent}.${s.name}` : s.name, s.lineStart, Math.max(s.lineStart, s.lineEnd));
    for (let l = s.lineStart; l <= Math.min(s.lineEnd, lines.length); l++) covered[l - 1] = true;
  }
  // Class headers (not covered by methods) are part of the remainder below, labelled with the class name.
  for (const c of classes) {
    const sym = file.symbols.find((s) => s.name === c && s.kind === "class")!;
    emit("symbol", `${c} (declaration)`, sym.lineStart, Math.min(sym.lineEnd, sym.lineStart + 30));
  }

  // Remainder: contiguous uncovered runs.
  let runStart = -1;
  for (let i = 0; i <= lines.length; i++) {
    const uncovered = i < lines.length && !covered[i];
    if (uncovered && runStart < 0) runStart = i;
    if (!uncovered && runStart >= 0) {
      const text = lines.slice(runStart, i).join("\n");
      if (text.trim().length > 20) emit("file-part", null, runStart + 1, i);
      runStart = -1;
    }
  }
  if (!chunks.length && content.trim()) {
    for (let s = 1; s <= lines.length; s += WINDOW - OVERLAP) {
      emit("file-part", null, s, Math.min(lines.length, s + WINDOW - 1));
      if (s + WINDOW - 1 >= lines.length) break;
    }
  }
  return chunks.sort((a, b) => a.lineStart - b.lineStart);
}
