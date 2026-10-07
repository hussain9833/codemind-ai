import { Search } from "lucide-react";
import Link from "next/link";
import { ConfidenceBadge, SeverityBadge, StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { StartInvestigationButton } from "@/components/features/start-investigation";
import { getInvestigations } from "@/lib/api";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Investigations" };

export default async function InvestigationsPage() {
  const user = await requireUser();
  const items = await getInvestigations(user.id);
  return (
    <>
      <PageHeader eyebrow="Investigate" title="Investigations" description="Evidence-driven investigations across your projects." actions={<StartInvestigationButton />} />
      {items.length === 0 ? (
        <EmptyState icon={<Search />} title="No investigations yet." description="Describe a problem and CodeMind will investigate the repository." action={<><StartInvestigationButton /><LinkButton href="/investigations/inv-1042">View sample investigation</LinkButton></>} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Investigations</caption>
              <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-subtle">
                <tr>{["Investigation", "Status", "Severity", "Confidence", "Evidence", "Created"].map((h) => <th key={h} scope="col" className="px-5 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((i) => (
                  <tr key={i.id} className="transition-colors hover:bg-surface-2">
                    <td className="max-w-md px-5 py-4"><Link href={`/investigations/${i.id}`} className="line-clamp-2 font-medium hover:text-accent-strong hover:underline">{i.title}</Link><div className="mt-0.5 font-mono text-xs text-subtle">{i.id.slice(0, 12)}</div></td>
                    <td className="px-5 py-4"><StatusBadge status={i.status} /></td>
                    <td className="px-5 py-4"><SeverityBadge severity={i.severity} /></td>
                    <td className="px-5 py-4">{i.status === "root-cause" ? <ConfidenceBadge level={i.confidence} label="" /> : <span className="text-subtle">—</span>}</td>
                    <td className="px-5 py-4 font-mono">{i.evidenceCount}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted">{i.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
