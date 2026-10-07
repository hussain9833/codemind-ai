/**
 * Repository-intelligence domain types. Pure (no DB / network imports) so the whole
 * pipeline can run and be tested against any FileSource.
 */

export interface SourceFile {
  /** Repo-relative POSIX path. */
  path: string;
  size: number;
  /** Blob SHA when the source provides one (GitHub), otherwise a content hash. */
  sha?: string;
}

/** Where repository files come from: GitHub tarball in production, a directory in tests. */
export interface FileSource {
  /** Commit SHA the files correspond to. */
  commitSha: string;
  branch: string;
  /** Yields every file (before filtering); content is read lazily so skipped files cost nothing. */
  files(): AsyncIterable<SourceFile & { read(): Promise<string | null> }>;
}

export type FileCategory = "source" | "test" | "config" | "docs" | "data" | "style" | "other";

export type SymbolKind = "function" | "class" | "interface" | "type" | "enum" | "component" | "route" | "variable" | "method";

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  lineStart: number;
  lineEnd: number;
  exported: boolean;
  /** Enclosing class for methods. */
  parent?: string;
  /** First line of the declaration, trimmed. */
  signature: string;
  /** For route symbols: HTTP method / path info. */
  meta?: Record<string, string>;
}

export interface ParsedFile {
  language: string;
  symbols: ExtractedSymbol[];
  /** Module specifiers imported by this file. */
  imports: string[];
  exports: string[];
  lineCount: number;
}

export interface IndexedFile extends ParsedFile {
  path: string;
  size: number;
  sha: string;
  category: FileCategory;
  isTest: boolean;
}

export interface CodeChunkData {
  filePath: string;
  language: string;
  kind: "symbol" | "file-part";
  symbol: string | null;
  lineStart: number;
  lineEnd: number;
  content: string;
  contentHash: string;
  imports: string[];
}

export interface CommitData {
  sha: string;
  message: string;
  authorName: string;
  authoredAt: Date;
  files: string[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  dev: boolean;
}

export interface RepoAnalysis {
  languages: { language: string; files: number; lines: number }[];
  frameworks: string[];
  packageManagers: string[];
  dependencies: DependencyInfo[];
  importantDirectories: { path: string; role: string }[];
  entryPoints: string[];
  apiRoutes: { path: string; file: string; methods: string[] }[];
  authentication: string[];
  database: string[];
  tests: { files: number; frameworks: string[] };
  configuration: string[];
  externalServices: string[];
}

export interface IndexStats {
  filesSeen: number;
  filesIndexed: number;
  filesSkipped: number;
  skippedReasons: Record<string, number>;
  symbols: number;
  chunks: number;
  bytesIndexed: number;
  durationMs: number;
}

export interface BuiltIndex {
  commitSha: string;
  branch: string;
  files: IndexedFile[];
  chunks: CodeChunkData[];
  analysis: RepoAnalysis;
  stats: IndexStats;
}

// ───────────── Search & evidence ─────────────

export type EvidenceKind = "FILE" | "LINE" | "SYMBOL" | "COMMIT" | "TEST" | "LOG" | "DEPENDENCY" | "DOCUMENTATION";

/** A located, verifiable piece of evidence. Everything needed to find the source is here. */
export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
  commitSha?: string;
  dependency?: string;
  excerpt?: string;
  /** Why this was selected, in plain words. */
  reasons: string[];
  score: number;
}

export interface TextHit { filePath: string; line: number; text: string }

export interface SymbolRow extends ExtractedSymbol { filePath: string }

/** Read side of the index. Implemented by Postgres (production) and memory (tests). */
export interface RepoIndexReader {
  files(): Promise<IndexedFile[]>;
  symbols(): Promise<SymbolRow[]>;
  commits(): Promise<CommitData[]>;
  analysis(): Promise<RepoAnalysis | null>;
  /** Case-insensitive substring search over source text. */
  searchText(term: string, limit: number): Promise<TextHit[]>;
}
