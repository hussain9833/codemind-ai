"use client";

import { useRef, type ReactNode, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> { id: T; label: ReactNode; icon?: ReactNode; count?: number }

/**
 * Accessible tab list (roving focus, arrow keys, Home/End). Presentation only: the caller owns
 * the selected id and renders the panel.
 */
export function Tabs<T extends string>({ items, value, onChange, label, size = "md", className }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; size?: "sm" | "md"; className?: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === value);
    const go = (n: number) => { const t = items[(n + items.length) % items.length]!; onChange(t.id); refs.current[t.id]?.focus(); };
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn("inline-flex gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn("inline-flex items-center gap-1.5 rounded-md font-medium transition-all duration-150", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm", active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
          >
            {t.icon}
            {t.label}
            {typeof t.count === "number" && <span className={cn("rounded px-1 font-mono text-xs", active ? "bg-accent-soft text-accent-strong" : "bg-surface-3 text-subtle")}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
