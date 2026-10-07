import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { TrackedProvider } from "./execution";
import { chatJSON } from "./json";
import { CHAT_FORMAT, evidenceBlock, INSUFFICIENT_EVIDENCE, RULES } from "./prompts";
import { retrieveContext, type ContextItem } from "./retrieval";
import type { ChatMessage } from "./types";

const outSchema = z.object({
  answer: z.string().min(1).max(8000),
  citations: z.array(z.string()).max(30).default([]),
  enough_evidence: z.boolean(),
  missing: z.string().nullable().optional(),
});

export interface ChatReference { ref: string; kind: string; title: string; filePath?: string; lineStart?: number; lineEnd?: number; symbol?: string; commitSha?: string; dependency?: string }
export interface ChatAnswer {
  answer: string;
  insufficient: boolean;
  missing: string | null;
  references: ChatReference[];
  model: string | null;
  usedVector: boolean;
  notes: string[];
  /** Paths the model mentioned that are not in the index; they were removed from the answer. */
  removedUnverified: string[];
}

const PATH_RE = /\b(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,6}\b/g;

/** Keeps only [E#] markers that exist; returns the cited ids actually used. */
function sanitizeCitations(answer: string, valid: Set<string>) {
  const used = new Set<string>();
  const cleaned = answer.replace(/\[(E\d+)\]/g, (m, id: string) => (valid.has(id) ? (used.add(id), m) : ""));
  return { cleaned: cleaned.replace(/[ \t]{2,}/g, " "), used };
}

async function removeUnverifiedPaths(answer: string, evidencePaths: Set<string>, repositoryId: string) {
  const mentioned = [...new Set(answer.match(PATH_RE) ?? [])].filter((p) => !/^(https?:|www\.)/.test(p) && !/^\d/.test(p));
  if (!mentioned.length) return { text: answer, removed: [] as string[] };
  const known = new Set((await db.repoFile.findMany({ where: { repositoryId, path: { in: mentioned } }, select: { path: true } })).map((f) => f.path));
  const removed: string[] = [];
  let text = answer;
  for (const p of mentioned) {
    // A path is fine if it is in the index, in the evidence, or is a suffix of a known/evidenced path (model shortened it).
    const ok = known.has(p) || evidencePaths.has(p) || [...evidencePaths].some((e) => e.endsWith(`/${p}`));
    if (!ok) { removed.push(p); text = text.split(p).join("[unverified reference removed]"); }
  }
  return { text, removed };
}

export async function answerQuestion(opts: { repositoryId: string; question: string; history?: { question: string; answer: string }[]; ai: TrackedProvider }): Promise<ChatAnswer> {
  const { repositoryId, question, ai } = opts;
  const history = (opts.history ?? []).slice(-3);
  const retrievalQuery = history.length ? `${history[history.length - 1]!.question}\n${question}` : question;

  const ctx = await retrieveContext(repositoryId, retrievalQuery, ai);

  // No evidence -> no model call. The model is never asked to answer from nothing.
  if (!ctx.items.length) {
    return { answer: `${INSUFFICIENT_EVIDENCE} Nothing in the indexed repository matches this question.`, insufficient: true, missing: "Relevant code, tests, commits or documentation", references: [], model: null, usedVector: ctx.usedVector, notes: ctx.notes, removedUnverified: [] };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: `${RULES}\n\n${CHAT_FORMAT}` },
    ...history.flatMap((h): ChatMessage[] => [{ role: "user", content: h.question }, { role: "assistant", content: h.answer.replace(/\[E\d+\]/g, "").slice(0, 1500) }]),
    { role: "user", content: `${evidenceBlock(ctx.items)}\n\nQuestion (from the user): ${question}\n\nAnswer using only the evidence above.` },
  ];

  const { data, result } = await chatJSON((m, o) => ai.chat("chat.answer", m, o), messages, outSchema, { maxTokens: 1400, temperature: 0.1 });

  const valid = new Set(ctx.items.map((i) => i.ref));
  const { cleaned, used } = sanitizeCitations(data.answer, valid);
  for (const c of data.citations) if (valid.has(c)) used.add(c);

  const evidencePaths = new Set(ctx.items.map((i) => i.filePath).filter((p): p is string => !!p));
  const { text, removed } = await removeUnverifiedPaths(cleaned, evidencePaths, repositoryId);

  // A conclusion with no supporting citation is not accepted.
  const insufficient = !data.enough_evidence || used.size === 0;
  const answer = insufficient
    ? `${INSUFFICIENT_EVIDENCE}${data.missing ? ` Missing: ${data.missing}` : ""}${used.size ? `\n\nWhat the evidence does show:\n${text}` : ""}`
    : text;

  const byRef = new Map(ctx.items.map((i) => [i.ref, i]));
  const references: ChatReference[] = [...used].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((r) => toRef(byRef.get(r)!));
  return { answer, insufficient, missing: data.missing ?? null, references, model: result.model, usedVector: ctx.usedVector, notes: ctx.notes, removedUnverified: removed };
}

const toRef = (i: ContextItem): ChatReference => ({ ref: i.ref, kind: i.kind, title: i.title, filePath: i.filePath, lineStart: i.lineStart, lineEnd: i.lineEnd, symbol: i.symbol, commitSha: i.commitSha, dependency: i.dependency });
