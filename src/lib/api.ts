import "server-only";
import { notFound } from "next/navigation";
import type { IndexStatus, Prisma } from "@prisma/client";
import { SAMPLE_INVESTIGATIONS } from "@/data/sample";
import { formatDate, timeAgo } from "@/lib/utils";
import { db } from "./db";
import type { Incident, Investigation, InvestigationStatus, InvestigationSummary, Level, Project, PullRequest, RepoStatus, Severity } from "./types";

/**
 * Data-access layer. Every function takes the authenticated userId and scopes queries
 * through project ownership, so callers cannot read another user's data by id.
 */

const repoStatus: Record<IndexStatus, RepoStatus> = { NOT_INDEXED: "not-indexed", INDEXING: "indexing", INDEXED: "indexed", FAILED: "unavailable" };
const lower = <T extends string>(v: T) => v.toLowerCase().replace(/_/g, "-");

type ProjectRow = Prisma.ProjectGetPayload<{ include: { repository: true; _count: { select: { investigations: true } } } }>;

function toProject(p: ProjectRow, active: number): Project {
  const r = p.repository;
  return {
    id: p.id,
    name: p.name,
    repository: r?.fullName ?? "—",
    branch: p.branch,
    status: r ? repoStatus[r.indexStatus] : "unavailable",
    health: null,
    framework: r?.framework ?? null,
    language: r?.language ?? null,
    dependencies: (r?.analysis as { dependencies?: unknown[] } | null)?.dependencies?.length ?? null,
    lastActivity: timeAgo(p.updatedAt),
    lastIndexed: r?.lastIndexedAt ? timeAgo(r.lastIndexedAt) : null,
    activeInvestigations: active,
  };
}

const projectInclude = { repository: true, _count: { select: { investigations: true } } } as const;

export async function getProjects(userId: string): Promise<Project[]> {
  const rows = await db.project.findMany({ where: { userId, archivedAt: null }, include: projectInclude, orderBy: { createdAt: "desc" } });
  const open = await db.investigation.groupBy({ by: ["projectId"], where: { project: { userId }, status: { not: "CLOSED" } }, _count: true });
  const counts = new Map(open.map((o) => [o.projectId, o._count]));
  return rows.map((p) => toProject(p, counts.get(p.id) ?? 0));
}

export async function getProject(userId: string, id: string): Promise<Project | undefined> {
  const p = await db.project.findFirst({ where: { id, userId, archivedAt: null }, include: projectInclude });
  if (!p) return undefined;
  const active = await db.investigation.count({ where: { projectId: id, status: { not: "CLOSED" } } });
  return toProject(p, active);
}

export async function getInvestigations(userId: string, projectId?: string): Promise<InvestigationSummary[]> {
  const rows = await db.investigation.findMany({
    where: { project: { userId, archivedAt: null }, ...(projectId ? { projectId } : {}) },
    include: { _count: { select: { evidence: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((i) => ({
    id: i.id,
    projectId: i.projectId,
    title: i.title,
    status: lower(i.status) as InvestigationStatus,
    severity: lower(i.severity) as Severity,
    confidence: (i.confidence ? lower(i.confidence) : "low") as Level,
    createdAt: formatDate(i.createdAt),
    lastActivity: timeAgo(i.updatedAt),
    evidenceCount: i._count.evidence,
  }));
}

/**
 * Investigation detail. SAMPLE investigations (public demo content) resolve by id; everything else
 * is read from the database and is only visible to the project's owner.
 */
export async function getInvestigation(userId: string, id: string): Promise<{ inv: Investigation; sample: boolean }> {
  const sample = SAMPLE_INVESTIGATIONS.find((i) => i.id === id);
  if (sample) return { inv: sample, sample: true };
  const r = await db.investigation.findFirst({
    where: { id, project: { userId, archivedAt: null } },
    include: { evidence: { orderBy: { score: "desc" } }, hypotheses: { include: { links: true }, orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } } },
  });
  if (!r) notFound();

  const detail = r.rootCauseDetail as null | { insufficient?: boolean; message?: string; missing?: string; whatHappened?: string; whyItHappened?: string; files?: string[]; symbols?: string[]; supportingEvidenceIds?: string[]; contradictingEvidenceIds?: string[]; alternatives?: { hypothesis: string; reason: string }[] };
  const running = r.status === "INVESTIGATING" || r.status === "OPEN";
  const evidence = r.evidence.map((e) => ({
    id: e.id, type: lower(e.type) as Investigation["evidence"][number]["type"], title: e.title, file: e.filePath ?? undefined,
    lines: e.startLine ? ([e.startLine, e.endLine ?? e.startLine] as [number, number]) : undefined, symbol: e.symbol ?? undefined, commit: e.commitSha ?? undefined,
    excerpt: e.excerpt ?? undefined, note: e.reasons.length ? `Selected because: ${e.reasons.join(" · ")}` : e.note,
  }));
  const rcFiles = detail?.files ?? [];
  const commits = r.evidence.filter((e) => e.commitSha && (detail?.supportingEvidenceIds ?? []).includes(e.id)).map((e) => e.commitSha!.slice(0, 7));

  const inv: Investigation = {
    id: r.id, projectId: r.projectId, title: r.title, problem: r.problem,
    status: lower(r.status) as InvestigationStatus, severity: lower(r.severity) as Severity, confidence: (r.confidence ? lower(r.confidence) : "low") as Level,
    createdAt: formatDate(r.createdAt), lastActivity: timeAgo(r.updatedAt),
    evidence,
    hypotheses: r.hypotheses.map((h) => ({
      id: h.id, title: h.title, likelihood: lower(h.likelihood) as Level, summary: h.summary,
      supporting: h.links.filter((l) => l.stance === "SUPPORTS").length, contradicting: h.links.filter((l) => l.stance === "CONTRADICTS").length,
      selected: h.isRootCause, status: lower(h.status) as "candidate" | "supported" | "refuted" | "inconclusive", verification: h.verification ?? undefined,
    })),
    timeline: r.events.map((e, i) => ({ id: e.id, label: e.label, detail: e.detail ?? undefined, at: e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }), state: running && i === r.events.length - 1 ? "active" : "done" })),
    rootCause: r.status === "ROOT_CAUSE" && detail?.whatHappened ? {
      explanation: `${detail.whatHappened}

${detail.whyItHappened ?? ""}`.trim(), confidence: (r.rootCauseLevel ? lower(r.rootCauseLevel) : "low") as Level,
      evidenceIds: detail.supportingEvidenceIds ?? [], contradictingIds: detail.contradictingEvidenceIds ?? [], files: rcFiles, commits, symbols: detail.symbols ?? [], alternatives: detail.alternatives ?? [],
    } : undefined,
    insufficient: r.status === "INCONCLUSIVE" ? { message: detail?.message ?? "There isn't enough evidence to determine the root cause yet.", missing: detail?.missing ?? "" } : undefined,
    error: r.error ?? undefined,
    running,
    tests: [],
    // Nothing has been generated or run yet: say so rather than implying otherwise.
    validation: [
      { id: "v1", name: "Type Check", state: "not-run", detail: "Runs after a fix exists" },
      { id: "v2", name: "Lint", state: "not-run", detail: "Runs after a fix exists" },
      { id: "v3", name: "Tests", state: "not-run", detail: "No sandbox configured" },
      { id: "v4", name: "Security Scan", state: "not-run", detail: "Runs after a fix exists" },
    ],
    review: { state: "not-started", note: "Review starts once a fix has been proposed." },
    pullRequest: { state: "none", note: "A pull request is only created after human approval." },
  };
  return { inv, sample: false };
}

export async function getPullRequests(userId: string): Promise<PullRequest[]> {
  const rows = await db.pullRequest.findMany({ where: { project: { userId, archivedAt: null } }, orderBy: { updatedAt: "desc" }, take: 100 });
  return rows.map((p) => ({ id: p.id, title: p.title, projectId: p.projectId, branch: p.branch, status: lower(p.status) as PullRequest["status"], investigationId: p.investigationId ?? undefined, updatedAt: timeAgo(p.updatedAt) }));
}

export async function getIncidents(userId: string): Promise<Incident[]> {
  const rows = await db.incident.findMany({ where: { project: { userId, archivedAt: null } }, orderBy: { openedAt: "desc" }, take: 100 });
  return rows.map((i) => ({ id: i.id, title: i.title, severity: lower(i.severity) as Severity, source: i.source ?? "Manual", status: lower(i.status) as Incident["status"], openedAt: timeAgo(i.openedAt) }));
}
