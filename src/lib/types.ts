export type Level = "high" | "medium" | "low";
export type Severity = "critical" | "high" | "medium" | "low";
export type InvestigationStatus = "open" | "investigating" | "root-cause" | "inconclusive" | "failed" | "fix-proposed" | "validated" | "closed";
export type CheckState = "passed" | "failed" | "not-run" | "pending";
export type EvidenceType = "file" | "line" | "symbol" | "commit" | "log" | "test" | "dependency" | "documentation";
export type RepoStatus = "indexed" | "indexing" | "unavailable" | "not-indexed";

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  status: RepoStatus;
  /** null until repository analysis exists (Phase 3+). */
  health: number | null;
  framework: string | null;
  language: string | null;
  dependencies: number | null;
  lastActivity: string;
  lastIndexed: string | null;
  activeInvestigations: number;
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  title: string;
  file?: string;
  lines?: [number, number];
  symbol?: string;
  commit?: string;
  excerpt?: string;
  note: string;
}

export interface Hypothesis {
  id: string;
  title: string;
  likelihood: Level;
  supporting: number;
  contradicting: number;
  summary: string;
  selected?: boolean;
  /** Verification outcome; absent for sample data. */
  status?: "candidate" | "supported" | "refuted" | "inconclusive";
  verification?: string;
}

export interface TimelineEvent {
  id: string;
  label: string;
  detail?: string;
  at: string;
  state: "done" | "active" | "upcoming";
}

export interface ValidationCheck {
  id: string;
  name: string;
  state: CheckState;
  detail?: string;
}

export interface FixProposal {
  file: string;
  risk: Level;
  explanation: string;
  original: string;
  proposed: string;
  changedLines: string;
}

export type InvestigationSummary = Pick<Investigation, "id" | "projectId" | "title" | "status" | "severity" | "confidence" | "createdAt" | "lastActivity"> & { evidenceCount: number };

export interface Investigation {
  id: string;
  projectId: string;
  title: string;
  problem: string;
  status: InvestigationStatus;
  severity: Severity;
  confidence: Level;
  createdAt: string;
  lastActivity: string;
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  timeline: TimelineEvent[];
  rootCause?: {
    explanation: string;
    confidence: Level;
    evidenceIds: string[];
    files: string[];
    commits: string[];
    contradictingIds?: string[];
    symbols?: string[];
    alternatives?: { hypothesis: string; reason: string }[];
  };
  /** Set when the investigation finished without enough evidence. */
  insufficient?: { message: string; missing: string };
  error?: string;
  /** True while the orchestrator is still running. */
  running?: boolean;
  fix?: FixProposal;
  tests: { name: string; file: string; state: CheckState }[];
  validation: ValidationCheck[];
  review: { state: "not-started" | "pending" | "approved"; note: string };
  pullRequest: { state: "none" | "draft" | "open"; note: string };
}

export interface ActivityItem {
  id: string;
  kind: "indexed" | "investigation-started" | "investigation-completed" | "pr-created" | "validation-completed";
  text: string;
  at: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
}

export interface PullRequest {
  id: string;
  title: string;
  projectId: string;
  branch: string;
  status: "draft" | "open" | "merged";
  investigationId?: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  source: string;
  status: "open" | "monitoring" | "resolved";
  openedAt: string;
}
