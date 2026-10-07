import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CommitData, IndexedFile, RepoAnalysis, RepoIndexReader, SymbolRow, SymbolKind, FileCategory, TextHit } from "./types";

/** Postgres-backed read side of the index for ONE repository. Callers must have authorized the project. */
export function dbReader(repositoryId: string): RepoIndexReader {
  return {
    async files(): Promise<IndexedFile[]> {
      const rows = await db.repoFile.findMany({ where: { repositoryId }, include: { symbols: true }, orderBy: { path: "asc" } });
      return rows.map((r) => ({
        path: r.path, language: r.language, category: r.category as FileCategory, isTest: r.isTest, size: r.size, lineCount: r.lineCount, sha: r.sha, imports: r.imports, exports: r.exports,
        symbols: r.symbols.map((s) => ({ name: s.name, kind: s.kind as SymbolKind, parent: s.parent ?? undefined, lineStart: s.lineStart, lineEnd: s.lineEnd, exported: s.exported, signature: s.signature, meta: (s.meta as Record<string, string> | null) ?? undefined })),
      }));
    },
    async symbols(): Promise<SymbolRow[]> {
      const rows = await db.repoSymbol.findMany({ where: { repositoryId }, include: { file: { select: { path: true } } } });
      return rows.map((s) => ({ filePath: s.file.path, name: s.name, kind: s.kind as SymbolKind, parent: s.parent ?? undefined, lineStart: s.lineStart, lineEnd: s.lineEnd, exported: s.exported, signature: s.signature, meta: (s.meta as Record<string, string> | null) ?? undefined }));
    },
    async commits(): Promise<CommitData[]> {
      const rows = await db.repoCommit.findMany({ where: { repositoryId }, orderBy: { authoredAt: "desc" }, take: 200 });
      return rows.map((c) => ({ sha: c.sha, message: c.message, authorName: c.authorName, authoredAt: c.authoredAt, files: c.files }));
    },
    async analysis(): Promise<RepoAnalysis | null> {
      const r = await db.repository.findUnique({ where: { id: repositoryId }, select: { analysis: true } });
      return (r?.analysis as unknown as RepoAnalysis | null) ?? null;
    },
    async searchText(term, limit): Promise<TextHit[]> {
      const needle = term.toLowerCase();
      // Escape LIKE wildcards. The pg_trgm GIN index serves ILIKE '%term%'.
      const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await db.$queryRaw<{ filePath: string; startLine: number; content: string }[]>(Prisma.sql`
        SELECT "filePath", "startLine", "content" FROM "CodeChunk"
        WHERE "repositoryId" = ${repositoryId} AND "content" ILIKE ${pattern}
        ORDER BY "filePath", "startLine" LIMIT ${Math.max(limit, 20)}`);
      const out: TextHit[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        const lines = r.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i]!.toLowerCase().includes(needle)) continue;
          const line = r.startLine + i;
          const key = `${r.filePath}:${line}`;
          if (seen.has(key)) continue; // overlapping chunks
          seen.add(key);
          out.push({ filePath: r.filePath, line, text: lines[i]!.trim().slice(0, 240) });
          if (out.length >= limit) return out;
        }
      }
      return out;
    },
  };
}
