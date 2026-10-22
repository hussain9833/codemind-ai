import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared input styling so every form looks the same in both themes. */
export const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg shadow-[inset_0_1px_0_rgb(0_0_0/0.04)] outline-none transition-all duration-150 placeholder:text-subtle hover:border-border-strong focus:border-accent focus:ring-4 focus:ring-accent/15 aria-[invalid=true]:border-danger";

export const textareaClass = cn(inputClass, "h-auto resize-none py-2.5 leading-relaxed");

export function Field({ label, hint, error, children, action }: { label: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium text-fg">{label}{action}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-danger">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export const InlineAlert = ({ tone = "danger", children }: { tone?: "danger" | "warning" | "info" | "success"; children: ReactNode }) => (
  <p role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-3.5 py-2.5 text-sm", { danger: "border-danger/30 bg-danger/10 text-danger", warning: "border-warning/30 bg-warning/10 text-warning", info: "border-info/30 bg-info/10 text-info", success: "border-success/30 bg-success/10 text-success" }[tone])}>{children}</p>
);
