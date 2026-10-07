import { AlertCircle, CheckCircle2, Circle, CircleDashed, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CheckState, InvestigationStatus, Level, RepoStatus, Severity } from "@/lib/types";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "purple";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted border-border",
  accent: "bg-accent-soft text-accent-strong border-accent/25",
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  info: "bg-info/10 text-info border-info/25",
  purple: "bg-purple/10 text-purple border-purple/25",
};

export const dotTone: Record<Tone, string> = {
  neutral: "bg-subtle", accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", purple: "bg-purple",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-5", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Small status dot; `live` adds a soft pulse for in-progress states. */
export function Dot({ tone = "neutral", live, className }: { tone?: Tone; live?: boolean; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", dotTone[tone], live && "pulse-dot", className)} />;
}

const statusMap: Record<InvestigationStatus, [Tone, string]> = {
  open: ["neutral", "Open"],
  investigating: ["info", "Investigating"],
  "root-cause": ["purple", "Root cause found"],
  inconclusive: ["warning", "Insufficient evidence"],
  failed: ["danger", "Failed"],
  "fix-proposed": ["accent", "Fix proposed"],
  validated: ["success", "Validated"],
  closed: ["neutral", "Closed"],
};
export const statusTone = (s: InvestigationStatus) => statusMap[s][0];
export const StatusBadge = ({ status }: { status: InvestigationStatus }) => (
  <Badge tone={statusMap[status][0]}>
    <Dot tone={statusMap[status][0]} live={status === "investigating"} />
    {statusMap[status][1]}
  </Badge>
);

const sevMap: Record<Severity, Tone> = { critical: "danger", high: "danger", medium: "warning", low: "neutral" };
export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge tone={sevMap[severity]} className="uppercase tracking-wide">{severity}</Badge>
);

const levelTone: Record<Level, Tone> = { high: "success", medium: "warning", low: "neutral" };
export const ConfidenceBadge = ({ level, label = "Confidence" }: { level: Level; label?: string }) => (
  <Badge tone={levelTone[level]}>
    {label && <span className="font-normal opacity-75">{label}</span>}
    <span className="font-semibold uppercase tracking-wide">{level}</span>
  </Badge>
);

const repoMap: Record<RepoStatus, [Tone, string]> = {
  indexed: ["success", "Indexed"],
  indexing: ["info", "Indexing"],
  unavailable: ["danger", "Unavailable"],
  "not-indexed": ["neutral", "Not indexed"],
};
export const RepoStatusBadge = ({ status }: { status: RepoStatus }) => (
  <Badge tone={repoMap[status][0]}>
    <Dot tone={repoMap[status][0]} live={status === "indexing"} />
    {repoMap[status][1]}
  </Badge>
);

export function RepoStatusDot({ status }: { status: RepoStatus }) {
  return <Dot tone={repoMap[status][0]} live={status === "indexing"} />;
}

const checkMap: Record<CheckState, { tone: Tone; label: string; icon: ReactNode }> = {
  passed: { tone: "success", label: "Passed", icon: <CheckCircle2 className="size-4" /> },
  failed: { tone: "danger", label: "Failed", icon: <XCircle className="size-4" /> },
  "not-run": { tone: "neutral", label: "Not run", icon: <Circle className="size-4" /> },
  pending: { tone: "warning", label: "Pending", icon: <CircleDashed className="size-4" /> },
};
export const checkMeta = (s: CheckState) => checkMap[s];
export const CheckBadge = ({ state }: { state: CheckState }) => (
  <Badge tone={checkMap[state].tone}>{checkMap[state].label}</Badge>
);

export const RiskBadge = ({ level }: { level: Level }) => (
  <Badge tone={level === "high" ? "danger" : level === "medium" ? "warning" : "success"}>
    <AlertCircle className="size-3.5" /> Risk {level}
  </Badge>
);

/** Numeric health. `null` means "not analysed", never zero. */
export function HealthScore({ value, size = "md" }: { value: number | null; size?: "sm" | "md" }) {
  if (value === null) return <span className="text-sm text-subtle" title="Available after repository analysis">—</span>;
  const tone = value >= 80 ? "text-success" : value >= 65 ? "text-warning" : "text-danger";
  return <span className={cn("font-mono font-semibold tabular-nums", tone, size === "md" ? "text-sm" : "text-xs")}>{value}</span>;
}
