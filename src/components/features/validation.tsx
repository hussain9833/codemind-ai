import { checkMeta, CheckBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckState, ValidationCheck } from "@/lib/types";

const iconTone: Record<CheckState, string> = { passed: "bg-success/12 text-success", failed: "bg-danger/12 text-danger", "not-run": "bg-surface-3 text-subtle", pending: "bg-warning/12 text-warning" };

/** Results exactly as recorded. Anything that did not run says "Not run"; nothing is implied. */
export function ValidationList({ checks }: { checks: ValidationCheck[] }) {
  return (
    <ul className="divide-y divide-border">
      {checks.map((c) => (
        <li key={c.id} className="flex items-center gap-3.5 px-5 py-3">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", iconTone[c.state])}>{checkMeta(c.state).icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{c.name}</p>
            {c.detail && <p className="truncate text-xs text-subtle">{c.detail}</p>}
          </div>
          <CheckBadge state={c.state} />
        </li>
      ))}
    </ul>
  );
}
