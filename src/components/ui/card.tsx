import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className, interactive, tone }: { children: ReactNode; className?: string; interactive?: boolean; tone?: "default" | "accent" | "warning" | "danger" | "success" | "purple" }) {
  const toneCls = { default: "border-border", accent: "border-accent/40", warning: "border-warning/40", danger: "border-danger/40", success: "border-success/40", purple: "border-purple/40" }[tone ?? "default"];
  return (
    <section className={cn("rounded-xl border bg-surface shadow-card transition-all duration-200", toneCls, interactive && "hover:-translate-y-px hover:border-border-strong hover:shadow-pop", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export const CardBody = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("p-5", className)}>{children}</div>
);

export function PageHeader({ title, description, actions, breadcrumb, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-2 text-xs text-muted [&_a]:transition-colors [&_a]:hover:text-fg">{breadcrumb}</div>}
        {eyebrow && <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Label / value pair used in metadata grids. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-fg">{value}</dd>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-success" : value >= 65 ? "bg-warning" : "bg-danger";
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-medium tabular-nums text-fg">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Circular score. Pure presentation of a number the caller already has. */
export function ScoreRing({ value, label, size = 96 }: { value: number; label?: string; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? "var(--success)" : value >= 65 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Score"}: ${value} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset 600ms ease" }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-semibold tabular-nums leading-none">{value}</div>
        {label && <div className="mt-1 text-xs text-subtle">{label}</div>}
      </div>
    </div>
  );
}

/** Small uppercase section label used inside cards and AI responses. */
export const SectionLabel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h3 className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtle after:h-px after:flex-1 after:bg-border", className)}>{children}</h3>
);
