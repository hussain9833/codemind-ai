import { GitBranch, GitPullRequest, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getPullRequests } from "@/lib/api";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Pull Requests" };

const tone: Record<string, Tone> = { merged: "purple", open: "success", draft: "neutral" };

export default async function PullRequestsPage() {
  const user = await requireUser();
  const items = await getPullRequests(user.id);
  return (
    <>
      <PageHeader eyebrow="Investigate" title="Pull Requests" description="Fixes that passed review and were approved by a human." />
      {items.length === 0 ? (
        <EmptyState icon={<GitPullRequest />} title="No pull requests yet." description="CodeMind never opens a pull request without your explicit approval." action={<span className="flex items-center gap-2 text-xs text-subtle"><ShieldCheck className="size-4" />Human approval is required for every pull request.</span>} />
      ) : (
        <ul className="space-y-3">
          {items.map((p, n) => (
            <li key={p.id} style={{ "--i": n } as React.CSSProperties} className="reveal flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5 shadow-card transition-all hover:border-border-strong hover:shadow-pop">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-muted"><GitPullRequest className="size-[18px]" /></span>
                <div className="min-w-0">
                  <p className="font-medium">{p.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-subtle"><span className="flex items-center gap-1 font-mono"><GitBranch className="size-3" />{p.branch}</span><span>{p.projectId.slice(0, 10)}</span><span>{p.updatedAt}</span>{p.investigationId && <Link href={`/investigations/${p.investigationId}`} className="text-accent-strong hover:underline">View investigation</Link>}</p>
                </div>
              </div>
              <Badge tone={tone[p.status] ?? "neutral"}>{p.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
