import { ArrowRight, Boxes, Cloud, Database, Globe, Layers, Network, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getProjects } from "@/lib/api";
import { findOwnedProject } from "@/lib/authz";
import { getRepoState } from "@/lib/repo-status";
import { getSelectedProjectId } from "@/lib/selected-project";
import { requireUser } from "@/lib/session";
import type { RepoAnalysis } from "@/lib/repo/types";

export const metadata = { title: "Architecture" };

interface Layer { id: string; title: string; icon: typeof Globe; items: string[]; empty: string; tone: string }

/** Layers are built only from what the analysis detected; empty layers say so. */
function layers(a: RepoAnalysis): Layer[] {
  const dirs = (re: RegExp) => a.importantDirectories.filter((d) => re.test(d.role)).map((d) => `${d.path}/`);
  return [
    { id: "ui", title: "Interface", icon: Globe, items: dirs(/UI/i), empty: "No UI directories detected", tone: "text-info" },
    { id: "api", title: "API", icon: Server, items: a.apiRoutes.length ? [`${a.apiRoutes.length} routes`, ...a.apiRoutes.slice(0, 4).map((r) => r.path), ...dirs(/API/i)] : dirs(/API/i), empty: "No API routes detected", tone: "text-accent-strong" },
    { id: "svc", title: "Services & shared code", icon: Layers, items: [...dirs(/Business|Shared|Authentication/i), ...a.entryPoints.slice(0, 3)], empty: "No service layer detected", tone: "text-purple" },
    { id: "data", title: "Data", icon: Database, items: [...a.database.slice(0, 3), ...dirs(/Data/i)], empty: "No data layer detected", tone: "text-success" },
    { id: "ext", title: "External services", icon: Cloud, items: a.externalServices, empty: "No external services detected", tone: "text-warning" },
  ];
}

export default async function ArchitecturePage() {
  const user = await requireUser();
  const id = await getSelectedProjectId(await getProjects(user.id));
  const project = id ? await findOwnedProject(user.id, id) : null;
  const state = project?.repository ? await getRepoState(project.repository.id) : null;
  const a = state?.analysis;

  if (!a) {
    return (<><PageHeader eyebrow="Codebase" title="Architecture" description="Layers and modules detected in the repository." /><EmptyState icon={<Network />} title="No architecture data yet" description="Index the repository to detect its directories, entry points and API routes." action={project ? <LinkButton href={`/projects/${project.id}`} variant="primary">Open project</LinkButton> : <LinkButton href="/projects/new" variant="primary">Create Project</LinkButton>} /></>);
  }
  const L = layers(a);
  return (
    <>
      <PageHeader eyebrow="Codebase" title="Architecture" description={`Detected from ${project!.repository!.fullName}. Layers show where code lives, not call-level dependencies.`} actions={<Badge tone="info">Derived from the index</Badge>} />

      <Card className="bg-dots">
        <CardHeader icon={<Boxes className="size-4" />} title="System layers" description="Request flow, top to bottom" />
        <CardBody>
          <ol className="flex flex-col items-stretch gap-2">
            {L.map((l, i) => (
              <li key={l.id} style={{ "--i": i } as React.CSSProperties} className="reveal">
                <div className="rounded-xl border border-border bg-surface p-4 shadow-card transition-all duration-200 hover:border-border-strong hover:shadow-pop">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex w-48 shrink-0 items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-surface-3"><l.icon className={`size-5 ${l.tone}`} /></span><h3 className="text-sm font-semibold">{l.title}</h3></div>
                    <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
                      {l.items.length ? l.items.map((it) => <li key={it} title={it} className="max-w-full truncate rounded-lg border border-border bg-surface-2 px-2.5 py-1 font-mono text-xs text-muted">{it}</li>) : <li className="text-sm text-subtle">{l.empty}</li>}
                    </ul>
                  </div>
                </div>
                {i < L.length - 1 && <div className="flex justify-center py-1 text-subtle" aria-hidden><ArrowRight className="size-4 rotate-90" /></div>}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Card><CardHeader title="Directories" /><CardBody>{a.importantDirectories.length ? <ul className="space-y-2">{a.importantDirectories.map((d) => <li key={d.path} className="flex items-center justify-between gap-3"><span className="font-mono text-sm">{d.path}/</span><Badge>{d.role}</Badge></li>)}</ul> : <p className="text-sm text-subtle">No conventional directories detected.</p>}</CardBody></Card>
        <Card><CardHeader title="Entry points" /><CardBody>{a.entryPoints.length ? <ul className="space-y-1.5">{a.entryPoints.map((e) => <li key={e} className="font-mono text-sm text-muted">{e}</li>)}</ul> : <p className="text-sm text-subtle">None detected.</p>}</CardBody></Card>
      </div>
    </>
  );
}
