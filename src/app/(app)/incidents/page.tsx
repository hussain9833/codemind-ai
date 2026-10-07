import { AlertTriangle, Clock } from "lucide-react";
import { Badge, dotTone, SeverityBadge, type Tone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getIncidents } from "@/lib/api";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Incidents" };

const statusTone: Record<string, Tone> = { open: "danger", monitoring: "warning", resolved: "success" };

export default async function IncidentsPage() {
  const user = await requireUser();
  const items = await getIncidents(user.id);
  const open = items.filter((i) => i.status === "open").length;
  return (
    <>
      <PageHeader eyebrow="Investigate" title="Incidents" description={items.length ? `${open} open · ${items.length} total` : "Production signals that may need an investigation."} />
      {items.length === 0 ? (
        <EmptyState icon={<AlertTriangle />} title="No incidents." description="Connect an observability source to see incidents here. CodeMind does not invent incidents." />
      ) : (
        <ul className="space-y-3">
          {items.map((i, n) => (
            <li key={i.id} style={{ "--i": n } as React.CSSProperties} className="reveal relative overflow-hidden rounded-xl border border-border bg-surface shadow-card transition-all hover:border-border-strong hover:shadow-pop">
              <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", dotTone[statusTone[i.status] ?? "neutral"])} />
              <div className="flex flex-wrap items-center justify-between gap-3 py-4 pl-6 pr-5">
                <div className="min-w-0">
                  <p className="font-medium">{i.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-subtle"><span className="font-mono">{i.id.slice(0, 10)}</span><span>{i.source}</span><span className="flex items-center gap-1"><Clock className="size-3" />{i.openedAt}</span></p>
                </div>
                <div className="flex items-center gap-2"><SeverityBadge severity={i.severity} /><Badge tone={statusTone[i.status] ?? "neutral"}>{i.status}</Badge></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
