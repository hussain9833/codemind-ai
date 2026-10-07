import "server-only";
import { Prisma, type EvidenceStance, type EvidenceType, type Level } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import type { TrackedProvider } from "./execution";
import { chatJSON } from "./json";
import { evidenceBlock, RULES } from "./prompts";
import type { ContextItem } from "./retrieval";
import { createToolContext, readLines, TOOL_NAMES, TOOLS, type ToolContext, type ToolName } from "./tools";
import type { ChatMessage } from "./types";
import { AIError } from "./types";

/**
 * The Investigation Orchestrator: one coordinator, deterministic tools underneath.
 *
 *   problem -> plan -> tools -> evidence -> hypotheses -> verification -> root cause (or "insufficient evidence")
 *
 * Every timeline event is written when it actually happens. Every claim the model makes must
 * cite evidence ids that exist; confidence is capped by what the evidence can actually support.
 */

export const INSUFFICIENT = "There isn't enough evidence to determine the root cause yet.";
const MAX_EVIDENCE = 22;

const LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
const levelRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
const minLevel = (a: Level, b: Level): Level => (levelRank[a] <= levelRank[b] ? a : b);

// ───────────── schemas ─────────────

const planSchema = z.object({
  understanding: z.string().max(600),
  searches: z.array(z.object({ tool: z.enum(TOOL_NAMES), input: z.string().min(1).max(200), reason: z.string().max(300).default("") })).min(1).max(8),
});

const hypothesesSchema = z.object({
  hypotheses: z.array(z.object({
    title: z.string().min(3).max(140),
    description: z.string().min(10).max(900),
    supporting: z.array(z.string()).max(12).default([]),
    contradicting: z.array(z.string()).max(12).default([]),
    confidence: z.enum(LEVELS),
  })).min(1).max(4),
});

const verifySchema = z.object({
  verdict: z.enum(["SUPPORTED", "REFUTED", "INCONCLUSIVE"]),
  reasoning: z.string().min(5).max(1200),
  supporting: z.array(z.string()).max(12).default([]),
  contradicting: z.array(z.string()).max(12).default([]),
  missing: z.string().nullable().optional(),
});

const rootCauseSchema = z.object({
  what_happened: z.string().min(10).max(1200),
  why_it_happened: z.string().min(10).max(1500),
  relevant_files: z.array(z.string()).max(10).default([]),
  relevant_symbols: z.array(z.string()).max(12).default([]),
  supporting: z.array(z.string()).min(1).max(12),
  contradicting: z.array(z.string()).max(8).default([]),
  alternatives_weaker: z.array(z.object({ hypothesis: z.string().max(160), reason: z.string().max(500) })).max(4).default([]),
});

// ───────────── helpers ─────────────

type Pool = { ref: string; dbId: string; item: ContextItem }[];

const eventLog = (investigationId: string) => async (type: string, label: string, detail?: string) => {
  await db.investigationEvent.create({ data: { investigationId, type, label, detail: detail?.slice(0, 500) } });
};

const itemKey = (i: Omit<ContextItem, "ref">) => i.commitSha ? `c:${i.commitSha}` : i.dependency ? `d:${i.dependency}` : `f:${i.filePath}:${i.lineStart ?? 0}`;

/** Hypothesis confidence can never exceed what the evidence supports, whatever the model says. */
export function capConfidence(claimed: Level, supportingFiles: number, supportingCount: number, contradicting: number): Level {
  let cap: Level = "LOW";
  if (supportingCount >= 1 && contradicting <= supportingCount) cap = "MEDIUM";
  if (supportingFiles >= 2 && contradicting === 0) cap = "HIGH";
  return minLevel(claimed, cap);
}

const validRefs = (refs: string[], pool: Pool) => [...new Set(refs.filter((r) => pool.some((p) => p.ref === r)))];

const stance = (s: "support" | "contradict"): EvidenceStance => (s === "support" ? "SUPPORTS" : "CONTRADICTS");

async function sendJSON<S extends z.ZodTypeAny>(ai: TrackedProvider, purpose: string, system: string, user: string, schema: S, maxTokens = 1400) {
  const messages: ChatMessage[] = [{ role: "system", content: system }, { role: "user", content: user }];
  return chatJSON((m, o) => ai.chat(purpose, m, o), messages, schema, { maxTokens, temperature: 0.1 });
}

// ───────────── the run ─────────────

export async function runInvestigation(investigationId: string, ai: TrackedProvider): Promise<void> {
  const inv = await db.investigation.findUniqueOrThrow({ where: { id: investigationId }, include: { project: { include: { repository: true } } } });
  const repo = inv.project.repository;
  const event = eventLog(investigationId);

  try {
    if (!repo || repo.indexStatus !== "INDEXED") throw new Error("Repository is not indexed");
    await event("repository_loaded", "Repository context loaded", `${repo.fullName} @ ${repo.lastIndexedSha?.slice(0, 7) ?? "unknown"} (${repo.indexedBranch ?? inv.project.branch})`);
    const ctx = await createToolContext(repo.id, inv.projectId, ai);
    const analysis = repo.analysis as { frameworks?: string[]; authentication?: string[]; database?: string[]; importantDirectories?: { path: string; role: string }[] } | null;
    const summary = analysis ? `Frameworks: ${(analysis.frameworks ?? []).join(", ") || "n/a"}. Auth: ${(analysis.authentication ?? []).slice(0, 3).join("; ") || "n/a"}. Data: ${(analysis.database ?? []).slice(0, 3).join("; ") || "n/a"}. Directories: ${(analysis.importantDirectories ?? []).slice(0, 8).map((d) => `${d.path} (${d.role})`).join(", ") || "n/a"}.` : "No analysis available.";

    // 1. Plan ───────────────────────────────────────────────
    let plan: z.infer<typeof planSchema>;
    try {
      const { data } = await sendJSON(ai, "investigation.plan", `${RULES}\n\nYou are the PLANNER. Choose which deterministic repository tools to run to gather evidence about the problem. Tools: ${TOOL_NAMES.join(", ")}.\n- searchRepository(query): hybrid search of code, symbols, files, deps, git\n- searchCode(text): exact text\n- findSymbol(name): functions/classes/components\n- getDependencies(name): packages and who imports them\n- getGitHistory(path-or-query): commits\n- readFile(path[:start-end]): read code\n- searchDocumentation(query), searchIncidents(query)\nPick 3-7 specific searches using words likely to appear in this repository. JSON: {"understanding": "...", "searches": [{"tool": "...", "input": "...", "reason": "..."}]}`, `Problem reported by the user:\n"""\n${inv.problem}\n"""\n\nRepository summary (from analysis): ${summary}`, planSchema, 900);
      plan = data;
      await event("plan", "Investigation planned", `${plan.searches.length} searches: ${[...new Set(plan.searches.map((s) => s.tool))].join(", ")}`);
    } catch (e) {
      // The planner is an optimisation; the investigation must not depend on it.
      plan = { understanding: inv.problem.slice(0, 300), searches: [{ tool: "searchRepository", input: inv.problem.slice(0, 200), reason: "default" }, { tool: "searchCode", input: inv.problem.slice(0, 200), reason: "default" }, { tool: "getGitHistory", input: inv.problem.slice(0, 200), reason: "default" }, { tool: "searchDocumentation", input: inv.problem.slice(0, 200), reason: "default" }] };
      await event("plan", "Investigation planned (deterministic fallback)", e instanceof AIError ? `Planner unavailable: ${e.code}` : "Planner unavailable");
    }
    await db.investigation.update({ where: { id: investigationId }, data: { plan: plan as unknown as Prisma.InputJsonValue } });

    // 2. Tools -> evidence ──────────────────────────────────
    const gathered = new Map<string, Omit<ContextItem, "ref">>();
    const notes: string[] = [];
    // Always search with the problem statement itself, in addition to the plan.
    const runs = [{ tool: "searchRepository" as ToolName, input: inv.problem.slice(0, 300) }, ...plan.searches];
    for (const s of runs) {
      try {
        const r = await TOOLS[s.tool](ctx as ToolContext, s.input);
        for (const it of r.items) {
          const k = itemKey(it);
          const prev = gathered.get(k);
          if (!prev || prev.score < it.score) gathered.set(k, { ...it, reasons: [...new Set([...(prev?.reasons ?? []), ...it.reasons])].slice(0, 6) });
        }
        notes.push(...(r.notes ?? []));
        await event("tool", `Ran ${s.tool}`, `“${s.input.slice(0, 80)}” → ${r.summary}`);
      } catch (e) {
        await event("tool_error", `${s.tool} failed`, e instanceof Error ? e.message.slice(0, 160) : "unknown error");
      }
    }

    // Rank + cap. Commits and dependencies can't crowd out code.
    const byScore = [...gathered.values()].sort((a, b) => b.score - a.score);
    const code = byScore.filter((i) => i.filePath).slice(0, 16);
    const other = byScore.filter((i) => !i.filePath).slice(0, MAX_EVIDENCE - code.length > 6 ? 6 : MAX_EVIDENCE - code.length);
    const selected = [...code, ...other].slice(0, MAX_EVIDENCE);

    const pool: Pool = [];
    for (const [i, item] of selected.entries()) {
      const row = await db.evidence.create({
        data: {
          investigationId, type: item.kind as EvidenceType, stance: "NEUTRAL", title: item.title.slice(0, 300), note: item.reasons.join(" · ").slice(0, 500) || "Selected by the evidence engine",
          filePath: item.filePath, startLine: item.lineStart, endLine: item.lineEnd, symbol: item.symbol, commitSha: item.commitSha, dependency: item.dependency,
          excerpt: item.text.slice(0, 1500), reasons: item.reasons, score: item.score,
        },
        select: { id: true },
      });
      pool.push({ ref: `E${i + 1}`, dbId: row.id, item: { ...item, ref: `E${i + 1}` } });
    }
    await event("evidence", "Evidence collected", `${pool.length} items (${new Set(pool.map((p) => p.item.filePath).filter(Boolean)).size} files)${notes.length ? ` · ${notes.length} similar-incident note(s)` : ""}`);

    if (pool.length === 0) {
      await finishInconclusive(investigationId, event, "No relevant evidence was found in the indexed repository.", "Relevant code, tests, logs, or a more specific description of where the problem occurs");
      return;
    }
    const items = pool.map((p) => p.item);

    // 3. Hypotheses ─────────────────────────────────────────
    const { data: hyp } = await sendJSON(ai, "investigation.hypotheses", `${RULES}\n\nYou are the HYPOTHESIS GENERATOR. Propose 2-4 distinct candidate causes of the reported problem. For each: a short title, a description of the mechanism, evidence ids that SUPPORT it, evidence ids that CONTRADICT it, and your confidence (HIGH, MEDIUM or LOW — qualitative; never a percentage). A hypothesis with no supporting evidence must be LOW. Do not claim a cause the evidence cannot show.\nJSON: {"hypotheses": [{"title": "...", "description": "...", "supporting": ["E1"], "contradicting": [], "confidence": "MEDIUM"}]}`, `Problem:\n"""\n${inv.problem}\n"""\n\n${evidenceBlock(items)}`, hypothesesSchema, 2000);

    type H = { dbId: string; title: string; description: string; supporting: string[]; contradicting: string[]; level: Level; status: "CANDIDATE" | "SUPPORTED" | "REFUTED" | "INCONCLUSIVE"; verification?: string };
    const hyps: H[] = [];
    for (const h of hyp.hypotheses) {
      const sup = validRefs(h.supporting, pool);
      const con = validRefs(h.contradicting.filter((c) => !sup.includes(c)), pool);
      const files = new Set(sup.map((r) => pool.find((p) => p.ref === r)!.item.filePath).filter(Boolean));
      const level = capConfidence(h.confidence, files.size, sup.length, con.length);
      const row = await db.hypothesis.create({ data: { investigationId, title: h.title, summary: h.description, likelihood: level }, select: { id: true } });
      await db.hypothesisEvidence.createMany({ data: [...sup.map((r) => ({ hypothesisId: row.id, evidenceId: pool.find((p) => p.ref === r)!.dbId, stance: stance("support") })), ...con.map((r) => ({ hypothesisId: row.id, evidenceId: pool.find((p) => p.ref === r)!.dbId, stance: stance("contradict") }))] });
      hyps.push({ dbId: row.id, title: h.title, description: h.description, supporting: sup, contradicting: con, level, status: "CANDIDATE" });
    }
    await event("hypotheses", "Hypotheses generated", hyps.map((h) => `${h.title} [${h.level}]`).join(" · "));

    // 4. Verification of the strongest candidates ───────────
    const ranked = [...hyps].filter((h) => h.supporting.length > 0).sort((a, b) => levelRank[b.level] - levelRank[a.level] || b.supporting.length - a.supporting.length).slice(0, 2);
    for (const h of ranked) {
      // Deeper, fresh reads of the cited code (not just the retrieval snippets).
      const extra: ContextItem[] = [];
      for (const r of h.supporting.slice(0, 4)) {
        const it = pool.find((p) => p.ref === r)!.item;
        if (!it.filePath) continue;
        const t = await readLines(ctx, it.filePath, Math.max(1, (it.lineStart ?? 1) - 15), (it.lineEnd ?? it.lineStart ?? 1) + 40);
        if (t) extra.push({ ...it, ref: `V${extra.length + 1}`, lineStart: t.start, lineEnd: t.end, text: t.text, reasons: ["verification read"] });
      }
      try {
        const { data: v } = await sendJSON(ai, "investigation.verify", `${RULES}\n\nYou are the VERIFIER. Decide whether the hypothesis is SUPPORTED, REFUTED or INCONCLUSIVE using ONLY the evidence. SUPPORTED requires a concrete mechanism visible in the code (not just related files). If the code contradicts it, REFUTED. If you would need logs, runtime data or code that is not shown, INCONCLUSIVE and say what is missing. Cite ids (E# from the original list, V# for the verification reads).\nJSON: {"verdict": "SUPPORTED|REFUTED|INCONCLUSIVE", "reasoning": "...", "supporting": ["E1","V1"], "contradicting": [], "missing": null}`, `Problem:\n"""\n${inv.problem}\n"""\n\nHypothesis to verify: ${h.title}\n${h.description}\n\n${evidenceBlock([...items, ...extra])}`, verifySchema, 1600);
        const allowed = new Set([...items, ...extra].map((i) => i.ref));
        const sup = v.supporting.filter((r) => allowed.has(r));
        const con = v.contradicting.filter((r) => allowed.has(r));
        // "SUPPORTED" without a single valid citation is not accepted.
        const verdict = v.verdict === "SUPPORTED" && sup.length === 0 ? "INCONCLUSIVE" : v.verdict;
        h.status = verdict;
        h.verification = v.reasoning + (v.missing ? ` Missing: ${v.missing}` : "");
        if (verdict === "REFUTED") h.level = "LOW";
        else if (verdict === "INCONCLUSIVE") h.level = minLevel(h.level, "MEDIUM");
        h.contradicting = [...new Set([...h.contradicting, ...con.filter((c) => pool.some((p) => p.ref === c))])];
        await db.hypothesis.update({ where: { id: h.dbId }, data: { status: verdict, likelihood: h.level, verification: h.verification.slice(0, 1500) } });
        for (const c of con.filter((c) => pool.some((p) => p.ref === c))) await db.hypothesisEvidence.upsert({ where: { hypothesisId_evidenceId: { hypothesisId: h.dbId, evidenceId: pool.find((p) => p.ref === c)!.dbId } }, create: { hypothesisId: h.dbId, evidenceId: pool.find((p) => p.ref === c)!.dbId, stance: "CONTRADICTS" }, update: { stance: "CONTRADICTS" } });
        await event("verification", `Verified: ${h.title}`, `${verdict}${verdict === "SUPPORTED" ? "" : ""} — ${v.reasoning.slice(0, 200)}`);
      } catch (e) {
        await event("verification_error", `Could not verify: ${h.title}`, e instanceof AIError ? `AI unavailable (${e.code})` : "verification failed");
      }
    }

    // 5. Root cause ─────────────────────────────────────────
    const winner = hyps.filter((h) => h.status === "SUPPORTED" && h.level !== "LOW").sort((a, b) => levelRank[b.level] - levelRank[a.level] || b.supporting.length - a.supporting.length)[0];
    if (!winner) {
      const missing = ranked.map((h) => h.verification).filter(Boolean).join(" ").slice(0, 400) || "Runtime evidence such as logs, stack traces or reproduction steps";
      await finishInconclusive(investigationId, event, INSUFFICIENT, missing);
      return;
    }

    const others = hyps.filter((h) => h !== winner);
    const winnerEvidence = [...new Set([...winner.supporting, ...winner.contradicting])].map((r) => pool.find((p) => p.ref === r)!.item);
    const { data: rc } = await sendJSON(ai, "investigation.root_cause", `${RULES}\n\nYou are writing the ROOT CAUSE ANALYSIS for a hypothesis that was verified against the code. Explain: what happened, why it happened (the mechanism), the relevant files and symbols (exactly as in evidence), the supporting evidence ids, any contradicting evidence ids, and why each alternative hypothesis is weaker. Do not add facts that are not in the evidence.\nJSON: {"what_happened": "...", "why_it_happened": "...", "relevant_files": [], "relevant_symbols": [], "supporting": ["E1"], "contradicting": [], "alternatives_weaker": [{"hypothesis": "...", "reason": "..."}]}`, `Problem:\n"""\n${inv.problem}\n"""\n\nVerified hypothesis: ${winner.title}\n${winner.description}\nVerification: ${winner.verification ?? ""}\n\nOther hypotheses:\n${others.map((o) => `- ${o.title} [${o.status}/${o.level}]: ${o.verification ?? o.description}`).join("\n") || "(none)"}\n\n${evidenceBlock(winnerEvidence.length ? [...winnerEvidence, ...items.filter((i) => !winnerEvidence.includes(i)).slice(0, 8)] : items)}`, rootCauseSchema, 1800).catch(() => ({ data: null }));

    const knownFiles = new Set((await db.repoFile.findMany({ where: { repositoryId: repo.id }, select: { path: true } })).map((f) => f.path));
    const evidenceFiles = [...new Set(winner.supporting.map((r) => pool.find((p) => p.ref === r)!.item.filePath).filter((f): f is string => !!f))];
    const detail = rc
      ? {
          whatHappened: rc.what_happened, whyItHappened: rc.why_it_happened,
          files: rc.relevant_files.filter((f) => knownFiles.has(f)),
          symbols: rc.relevant_symbols, supporting: validRefs(rc.supporting, pool), contradicting: validRefs(rc.contradicting, pool),
          alternatives: rc.alternatives_weaker,
        }
      : { whatHappened: winner.description, whyItHappened: winner.verification ?? "", files: evidenceFiles, symbols: [], supporting: winner.supporting, contradicting: winner.contradicting, alternatives: [] };
    if (detail.files.length === 0) detail.files = evidenceFiles;
    if (detail.supporting.length === 0) detail.supporting = winner.supporting;
    const refToDb = Object.fromEntries(pool.map((p) => [p.ref, p.dbId]));
    const detailOut = { ...detail, supportingEvidenceIds: detail.supporting.map((r) => refToDb[r]), contradictingEvidenceIds: detail.contradicting.map((r) => refToDb[r]) };

    await db.hypothesis.update({ where: { id: winner.dbId }, data: { isRootCause: true } });
    await db.investigation.update({ where: { id: investigationId }, data: { status: "ROOT_CAUSE", rootCause: `${detail.whatHappened}\n\n${detail.whyItHappened}`.slice(0, 4000), rootCauseLevel: winner.level, confidence: winner.level, rootCauseDetail: detailOut as unknown as Prisma.InputJsonValue, error: null } });
    await event("root_cause", "Root cause identified", `${winner.title} [${winner.level}]`);
  } catch (e) {
    const code = e instanceof AIError ? e.code : "internal_error";
    log.error("investigation.failed", { investigationId, code, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    const message = e instanceof AIError ? (e.code === "rate_limited" ? e.message : "The AI service was unavailable, so the investigation could not finish. Retry shortly.") : "The investigation stopped because of an internal error.";
    await db.investigation.update({ where: { id: investigationId }, data: { status: "FAILED", error: message } }).catch(() => undefined);
    await event("failed", "Investigation stopped", message).catch(() => undefined);
  }
}

async function finishInconclusive(investigationId: string, event: ReturnType<typeof eventLog>, message: string, missing: string) {
  await db.investigation.update({ where: { id: investigationId }, data: { status: "INCONCLUSIVE", rootCause: null, rootCauseDetail: { insufficient: true, message, missing } as unknown as Prisma.InputJsonValue, error: null } });
  await event("inconclusive", "Evidence insufficient", `${message} Missing: ${missing}`.slice(0, 480));
}
