import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-dots flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-border bg-surface-2 text-muted shadow-card [&_svg]:size-6">{icon}</div>}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, description, causes, actions, className }: { title: string; description: string; causes?: string[]; actions?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("mx-auto max-w-xl rounded-xl border border-danger/30 bg-danger/5 p-6 shadow-card", className)}>
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger"><AlertTriangle className="size-5" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
          {causes && causes.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Why this may have happened</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-muted">
                {causes.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}
          {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export type StepState = "done" | "active" | "waiting";

/** Progress list. The caller supplies real states; this component never advances on its own. */
export function ProgressSteps({ title, steps }: { title: string; steps: { label: string; state: StepState }[] }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight"><Loader2 className="size-4 animate-spin text-accent" aria-hidden />{title}</h2>
      <ol className="relative space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className={cn("relative flex items-center gap-3 text-sm transition-colors", s.state === "waiting" ? "text-subtle" : s.state === "active" ? "font-medium text-fg" : "text-muted")}>
            {i < steps.length - 1 && <span aria-hidden className="absolute left-[9px] top-5 h-3 w-px bg-border" />}
            {s.state === "done" ? <CheckCircle2 className="size-[19px] text-success" /> : s.state === "active" ? <span className="grid size-[19px] place-items-center"><span className="ring-pulse size-2.5 rounded-full bg-accent" /></span> : <Circle className="size-[19px]" />}
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("shimmer rounded-lg bg-surface-3", className)} />
);

/** Inline "working" indicator for AI/long operations. Shows elapsed time, never fake stages. */
export function WorkingIndicator({ label, elapsedSeconds }: { label: string; elapsedSeconds?: number }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted">
      <span className="relative grid size-5 place-items-center"><span className="ring-pulse absolute size-3 rounded-full bg-accent/60" /><span className="size-2 rounded-full bg-accent" /></span>
      <span>{label}{typeof elapsedSeconds === "number" && <span className="ml-2 font-mono text-xs text-subtle">{elapsedSeconds}s</span>}</span>
    </div>
  );
}
