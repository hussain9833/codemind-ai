import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { dbReader } from "@/lib/repo/db-reader";
import { findEvidence } from "@/lib/repo/evidence";
import type { EvidenceItem, EvidenceKind } from "@/lib/repo/types";
import type { TrackedProvider } from "./execution";
import { redactSecrets } from "./redact";
import { embeddingCounts, searchVectors, type VectorHit } from "./vector";

/**
 * Hybrid retrieval: deterministic evidence (exact text, symbols, files, dependencies, git)
 * fused with vector search by Reciprocal Rank Fusion, then trimmed to a small, cited context.
 * The goal is the SMALLEST set of highly relevant evidence — never the whole repository.
 */

export interface ContextItem {
  /** Stable handle the model must cite: E1, E2, ... */
  ref: string;
  kind: EvidenceKind;
  title: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
  commitSha?: string;
  dependency?: string;
  /** Redacted code/text shown to the model. */
  text: string;
  reasons: string[];
  score: number;
}

export interface RetrievalResult { items: ContextItem[]; usedVector: boolean; vectorChunks: number; notes: string[] }

const RRF_K = 60;
const MAX_FILES = 8;
const MAX_NON_CODE = 3;
const SNIPPET_CHARS = 2400;
const TOTAL_CHARS = 22_000;

export interface RetrievalOptions { maxFiles?: number; vector?: boolean; totalChars?: number }

export async function retrieveContext(repositoryId: string, query: string, ai: TrackedProvider | null, opts: RetrievalOptions = {}): Promise<RetrievalResult> {
  const notes: string[] = [];
  const reader = dbReader(repositoryId);
  const { evidence } = await findEvidence(reader, query, { limit: 60 });

  // ── Vector leg (optional) ──
  let hits: VectorHit[] = [];
  let usedVector = false;
  if (ai && opts.vector !== false) {
    try {
      const { model, dimension } = await ai.raw.embeddingInfo();
      const counts = await embeddingCounts(repositoryId, model);
      if (counts.embedded > 0) {
        const q = await ai.embed("retrieval.query", [query.slice(0, 2000)], { inputType: "query" });
        hits = await searchVectors(repositoryId, q.vectors[0]!, dimension, 20);
        usedVector = true;
        if (counts.embedded < counts.total) notes.push(`Semantic index is partial (${counts.embedded}/${counts.total} chunks).`);
      } else notes.push("Semantic index not built yet; used exact/symbol/file/dependency/git search only.");
    } catch (e) {
      notes.push("Semantic search was unavailable; used deterministic search only.");
      log.warn("ai.retrieval.vector_failed", { repositoryId, error: e instanceof Error ? e.name : "unknown" });
    }
  }

  // ── Fuse at file level with RRF ──
  const score = new Map<string, number>();
  const bump = (file: string, rank: number) => score.set(file, (score.get(file) ?? 0) + 1 / (RRF_K + rank));
  const detFiles: string[] = [];
  for (const e of evidence) if (e.filePath && !detFiles.includes(e.filePath)) detFiles.push(e.filePath);
  detFiles.forEach((f, i) => bump(f, i + 1));
  const vecFiles: string[] = [];
  for (const h of hits) if (!vecFiles.includes(h.filePath)) vecFiles.push(h.filePath);
  vecFiles.forEach((f, i) => bump(f, i + 1));
  const sortedFiles = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Relevance floor: a file far below the best match is noise, not evidence.
  const rankedFiles = sortedFiles.filter(([, s]) => s >= sortedFiles[0]![1] * 0.5).slice(0, opts.maxFiles ?? MAX_FILES);

  // ── Build context items: per file, the best located snippets ──
  const items: Omit<ContextItem, "ref">[] = [];
  let chars = 0;
  const budget = opts.totalChars ?? TOTAL_CHARS;
  const push = (it: Omit<ContextItem, "ref">) => { if (chars + it.text.length > budget) return false; chars += it.text.length; items.push(it); return true; };

  for (const [file, fused] of rankedFiles) {
    const detForFile = evidence.filter((e) => e.filePath === file);
    const lineHits = detForFile.filter((e) => e.kind === "LINE" || e.kind === "SYMBOL");
    const vecForFile = hits.filter((h) => h.filePath === file).slice(0, 2);
    const fileItem = detForFile.find((e) => e.kind === "FILE" || e.kind === "TEST" || e.kind === "DOCUMENTATION");
    const reasons = [...new Set([...(fileItem?.reasons ?? []), ...vecForFile.map((h) => `semantically similar (${h.similarity.toFixed(2)})`)])].slice(0, 5);

    const targets: { start?: number; end?: number; kind: EvidenceKind; symbol?: string; vec?: VectorHit }[] = [
      ...vecForFile.map((h) => ({ start: h.startLine, end: h.endLine, kind: (h.symbol ? "SYMBOL" : "LINE") as EvidenceKind, symbol: h.symbol ?? undefined, vec: h })),
      ...lineHits.slice(0, 2).map((e) => ({ start: e.lineStart, end: e.lineEnd, kind: e.kind, symbol: e.symbol })),
    ];
    if (!targets.length) targets.push({ kind: fileItem?.kind ?? "FILE" });

    const seen = new Set<string>();
    for (const t of targets.slice(0, 3)) {
      const key = `${t.start ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const snippet = t.vec ? { content: t.vec.content, startLine: t.vec.startLine, endLine: t.vec.endLine, symbol: t.vec.symbol } : await chunkAround(repositoryId, file, t.start);
      if (!snippet) continue;
      const text = redactSecrets(snippet.content.slice(0, SNIPPET_CHARS));
      const ok = push({ kind: t.kind, title: `${file}${snippet.startLine ? `:${t.start ?? snippet.startLine}` : ""}`, filePath: file, lineStart: t.start ?? snippet.startLine, lineEnd: t.end ?? snippet.endLine, symbol: t.symbol ?? snippet.symbol ?? undefined, text, reasons, score: fused });
      if (!ok) break;
    }
  }

  // Non-code evidence: commits and dependencies carry short text.
  const commits = evidence.filter((x) => x.kind === "COMMIT");
  const commitFloor = (commits[0]?.score ?? 0) * 0.5;
  for (const e of commits.filter((c) => c.score >= commitFloor).slice(0, MAX_NON_CODE)) push({ kind: "COMMIT", title: e.title, commitSha: e.commitSha, text: redactSecrets(`${e.title}\n${e.excerpt ?? ""}`), reasons: e.reasons, score: e.score });
  for (const e of evidence.filter((x) => x.kind === "DEPENDENCY").slice(0, 3)) push({ kind: "DEPENDENCY", title: e.title, dependency: e.dependency, text: `${e.title}\n${e.excerpt ?? ""}`, reasons: e.reasons, score: e.score });

  return { items: items.map((it, i) => ({ ...it, ref: `E${i + 1}` })), usedVector, vectorChunks: hits.length, notes };
}

async function chunkAround(repositoryId: string, filePath: string, line?: number): Promise<{ content: string; startLine: number; endLine: number; symbol: string | null } | null> {
  const chunk = await db.codeChunk.findFirst({
    where: { repositoryId, filePath, ...(line ? { startLine: { lte: line }, endLine: { gte: line } } : {}) },
    orderBy: line ? { startLine: "asc" } : { startLine: "asc" },
    select: { content: true, startLine: true, endLine: true, symbol: true },
  });
  return chunk ?? null;
}

export type { EvidenceItem };
