import { analyzeRepository, MANIFEST_RE, type Manifests } from "./analyze";
import { chunkFile } from "./chunk";
import { contentSkipReason, createPathFilter, MAX_FILES, MAX_TOTAL_BYTES, type SkipReason } from "./filter";
import { categorize, detectLanguage, isTestPath } from "./languages";
import { parseFile } from "./parse";
import { hashContent } from "./chunk";
import type { BuiltIndex, CodeChunkData, FileSource, IndexedFile, IndexStats } from "./types";

export interface PipelineHooks { onProgress?(stage: string, detail?: string): void }

/**
 * Runs the pure ingestion pipeline: filter → read → parse → chunk → analyze.
 * No database or network access happens here; the FileSource supplies the files.
 */
export async function buildIndex(source: FileSource, hooks: PipelineHooks = {}): Promise<BuiltIndex> {
  const t0 = Date.now();
  const skipped: Record<string, number> = {};
  const skip = (r: SkipReason | "limit") => { skipped[r] = (skipped[r] ?? 0) + 1; };

  // The root .gitignore is respected: collect candidates first, find it, then filter.
  const candidates: Awaited<ReturnType<FileSource["files"]> extends AsyncIterable<infer T> ? T : never>[] = [];
  for await (const f of source.files()) candidates.push(f);
  const filesSeen = candidates.length;

  const gi = candidates.find((c) => c.path === ".gitignore");
  const filter = createPathFilter(gi ? await gi.read() : null);
  hooks.onProgress?.("Filtering files", `${filesSeen} files found`);

  const files: IndexedFile[] = [];
  const chunks: CodeChunkData[] = [];
  const manifests: Manifests = {};
  let bytes = 0;

  for (const c of candidates) {
    const reason = filter.check(c.path, c.size);
    if (reason) { skip(reason); continue; }
    if (files.length >= MAX_FILES || bytes + c.size > MAX_TOTAL_BYTES) { skip("limit"); continue; }
    const content = await c.read();
    if (content === null) { skip("binary"); continue; }
    const cr = contentSkipReason(content);
    if (cr) { skip(cr); continue; }

    const language = detectLanguage(c.path);
    let parsed;
    try { parsed = parseFile(c.path, content); }
    catch { parsed = { language, symbols: [], imports: [], exports: [], lineCount: content.split("\n").length }; } // a parse failure must not abort indexing
    const file: IndexedFile = { ...parsed, path: c.path, size: c.size, sha: c.sha ?? hashContent(content), category: categorize(c.path, language), isTest: isTestPath(c.path) };
    files.push(file);
    chunks.push(...chunkFile(file, content));
    bytes += c.size;
    if (MANIFEST_RE.test(c.path) && c.size < 200_000) manifests[c.path] = content;
    if (files.length % 200 === 0) hooks.onProgress?.("Parsing source", `${files.length} files`);
  }

  hooks.onProgress?.("Analyzing repository");
  const analysis = analyzeRepository(files, manifests, candidates.map((c) => c.path));

  const stats: IndexStats = {
    filesSeen,
    filesIndexed: files.length,
    filesSkipped: filesSeen - files.length,
    skippedReasons: skipped,
    symbols: files.reduce((n, f) => n + f.symbols.length, 0),
    chunks: chunks.length,
    bytesIndexed: bytes,
    durationMs: Date.now() - t0,
  };
  return { commitSha: source.commitSha, branch: source.branch, files, chunks, analysis, stats };
}
