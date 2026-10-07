import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/types";

/** Real events only. `active` marks the step currently running; `upcoming` is shown muted. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative">
      {events.map((e, i) => (
        <li key={e.id} style={{ "--i": i } as React.CSSProperties} className="reveal relative flex gap-3.5 pb-5 last:pb-0">
          {i < events.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-border" aria-hidden />}
          <span
            aria-hidden
            className={cn("relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 bg-surface transition-colors",
              e.state === "done" && "border-success bg-success/15 text-success", e.state === "active" && "border-accent text-accent", e.state === "upcoming" && "border-border-strong")}
          >
            {e.state === "done" ? <Check className="size-3" strokeWidth={3} /> : e.state === "active" ? <span className="ring-pulse size-2 rounded-full bg-accent" /> : null}
          </span>
          <div className="min-w-0 pt-px">
            <p className={cn("text-sm leading-snug", e.state === "upcoming" ? "text-subtle" : "font-medium text-fg")}>
              {e.label}
              {e.state === "active" && <span className="sr-only"> (in progress)</span>}
            </p>
            {e.detail && <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted">{e.detail}</p>}
            <p className="mt-0.5 text-xs text-subtle">{e.at}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
