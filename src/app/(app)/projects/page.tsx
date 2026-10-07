import { FolderGit2, Plus } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { HealthScore, RepoStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { ProjectCard } from "@/components/features/lists";
import { getProjects } from "@/lib/api";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await getProjects(user.id);
  const create = <LinkButton href="/projects/new" variant="primary" icon={<Plus className="size-4" />}>Create Project</LinkButton>;
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Projects" description="Repositories connected to CodeMind. Each project is private to you." actions={create} />
      {projects.length === 0 ? (
        <EmptyState icon={<FolderGit2 />} title="No projects yet." description="Connect a GitHub repository to start investigating problems with evidence." action={create} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{projects.map((p, i) => <div key={p.id} className="reveal" style={{ "--i": i } as React.CSSProperties}><ProjectCard project={p} /></div>)}</div>
          <div className="mt-8 hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">All projects</caption>
              <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-subtle">
                <tr>{["Project", "Repository", "Branch", "Health", "Investigations", "Last activity", "Status"].map((h) => <th key={h} scope="col" className="px-5 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3.5 font-medium"><Link href={`/projects/${p.id}`} className="hover:text-accent-strong hover:underline">{p.name}</Link></td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted">{p.repository}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted">{p.branch}</td>
                    <td className="px-5 py-3.5"><HealthScore value={p.health} /></td>
                    <td className="px-5 py-3.5">{p.activeInvestigations}</td>
                    <td className="px-5 py-3.5 text-muted">{p.lastActivity}</td>
                    <td className="px-5 py-3.5"><RepoStatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
