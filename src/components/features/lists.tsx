import { GitBranch } from "lucide-react";
import Link from "next/link";
import { ConfidenceBadge, HealthScore, RepoStatusBadge, SeverityBadge, StatusBadge, statusTone, dotTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InvestigationSummary, Project } from "@/lib/types";

export function InvestigationRow({ inv }: { inv: InvestigationSummary }) {
  return (
    <Link href={`/investigations/${inv.id}`} className="group relative block px-5 py-4 transition-colors hover:bg-surface-2">
      <span aria-hidden className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-100", dotTone[statusTone(inv.status)])} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug">{inv.title}</h3>
        <StatusBadge status={inv.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-subtle">
        <span className="font-mono">{inv.id.slice(0, 10)}</span>
        <SeverityBadge severity={inv.severity} />
        <span>{inv.evidenceCount} evidence</span>
        {inv.status === "root-cause" && <ConfidenceBadge level={inv.confidence} />}
        <span>Active {inv.lastActivity}</span>
      </div>
    </Link>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="group block rounded-xl border border-border bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{project.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-subtle"><GitBranch className="size-3" />{project.repository} · {project.branch}</p>
        </div>
        <RepoStatusBadge status={project.status} />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        <div><dt className="text-xs text-subtle">Health</dt><dd className="mt-0.5"><HealthScore value={project.health} /></dd></div>
        <div><dt className="text-xs text-subtle">Investigations</dt><dd className="mt-0.5 font-medium">{project.activeInvestigations}</dd></div>
        <div><dt className="text-xs text-subtle">Activity</dt><dd className="mt-0.5 truncate">{project.lastActivity}</dd></div>
      </dl>
    </Link>
  );
}

export { SeverityBadge };
