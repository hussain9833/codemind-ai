import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Database, FileCode2, GitPullRequest, MessageSquare, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, Dot, RepoStatusBadge, type Tone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader, ScoreRing, ScoreBar, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { InvestigationRow } from "@/components/features/lists";
import { StartInvestigationButton } from "@/components/features/start-investigation";
import { SAMPLE_HEALTH } from "@/data/sample-health";
import { getIncidents, getInvestigations, getProjects, getPullRequests } from "@/lib/api";
import { getSelectedProjectId } from "@/lib/selected-project";
import { requireUser } from "@/lib/session";
import type { ActivityItem } from "@/lib/types";

// Activity feed is populated by indexing/investigation events (later phases).
const getActivity = (): ActivityItem[] => [];

const activityIcon: Record<ActivityItem["kind"], LucideIcon> = {
  indexed: Database, "investigation-started": Search, "investigation-completed": CheckCircle2, "pr-created": GitPullRequest, "validation-completed": ShieldCheck,
};

interface Attention { id: string; tone: Tone; icon: LucideIcon; title: string; detail: string; href: string }

export default async function DashboardPage() {
  const user = await requireUser();
  const projects = await getProjects(user.id);
  const selectedId = await getSelectedProjectId(projects);
  const project = projects.find((p) => p.id === selectedId) ?? projects[0];
  const investigations = await getInvestigations(user.id);
  const incidents = await getIncidents(user.id);
  const prs = await getPullRequests(user.id);
  const active = investigations.filter((i) => i.status !== "closed");
  const activity = getActivity();

  // "Needs attention" is derived only from real records.
  const attention: Attention[] = [];
  if (project && project.status === "not-indexed") attention.push({ id: "idx", tone: "warning", icon: Database, title: "Repository is not indexed", detail: `Index ${project.repository} to enable search, Ask and investigations.`, href: `/projects/${project.id}` });
  if (project && project.status === "unavailable") attention.push({ id: "idxf", tone: "danger", icon: AlertTriangle, title: "Repository indexing failed", detail: "Open the project to see the reason and retry.", href: `/projects/${project.id}` });
  for (const i of investigations.filter((x) => x.status === "failed")) attention.push({ id: i.id, tone: "danger", icon: AlertTriangle, title: i.title, detail: "Investigation failed — open it to see why.", href: `/investigations/${i.id}` });
  for (const i of investigations.filter((x) => x.status === "investigating")) attention.push({ id: i.id, tone: "info", icon: Search, title: i.title, detail: "Investigation in progress.", href: `/investigations/${i.id}` });
  for (const i of investigations.filter((x) => x.status === "inconclusive")) attention.push({ id: i.id, tone: "warning", icon: AlertTriangle, title: i.title, detail: "Not enough evidence yet — add logs or details.", href: `/investigations/${i.id}` });
  for (const i of investigations.filter((x) => x.status === "root-cause")) attention.push({ id: i.id, tone: "purple", icon: CheckCircle2, title: i.title, detail: "Root cause found and ready for review.", href: `/investigations/${i.id}` });
  for (const i of incidents.filter((x) => x.status === "open")) attention.push({ id: i.id, tone: "danger", icon: AlertTriangle, title: i.title, detail: `Open ${i.severity} incident · ${i.openedAt}`, href: "/incidents" });

  return (
    <>
      <PageHeader
        eyebrow="Command center"
        title={project ? project.name : "Welcome to CodeMind"}
        description={project ? <span className="flex flex-wrap items-center gap-2">{project.repository} · {project.branch} <RepoStatusBadge status={project.status} /></span> : "Connect a repository to start investigating problems with evidence."}
        actions={project ? <><LinkButton href="/ask" icon={<MessageSquare className="size-4" />}>Ask</LinkButton><LinkButton href="/repository" icon={<FileCode2 className="size-4" />}>Explore code</LinkButton><StartInvestigationButton /></> : <LinkButton href="/projects/new" variant="primary">Create Project</LinkButton>}
      />

      {!project ? (
        <EmptyState icon={<Database />} title="No project yet" description="Connect a GitHub repository. CodeMind indexes it, then you can ask questions and investigate problems with cited evidence." action={<LinkButton href="/projects/new" variant="primary">Create Project</LinkButton>} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card tone={attention.some((a) => a.tone === "danger") ? "danger" : "default"}>
              <CardHeader icon={<AlertTriangle className="size-4" />} title="Needs your attention" description={attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}` : "Nothing is waiting on you"} />
              {attention.length ? (
                <ul className="divide-y divide-border">
                  {attention.slice(0, 6).map((a, i) => (
                    <li key={a.id + i} style={{ "--i": i } as React.CSSProperties} className="reveal">
                      <Link href={a.href} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3"><Dot tone={a.tone} live={a.tone === "info"} className="size-2.5" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.title}</span><span className="block truncate text-xs text-muted">{a.detail}</span></span>
                        <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <CardBody className="flex items-center gap-3 text-sm text-muted"><CheckCircle2 className="size-5 text-success" />All clear. Start an investigation when something breaks.</CardBody>}
            </Card>

            <Card>
              <CardHeader icon={<Search className="size-4" />} title="Active investigations" description={`${active.length} in progress or awaiting review`} actions={<Link href="/investigations" className="text-xs font-medium text-accent-strong hover:underline">View all</Link>} />
              {active.length ? <div className="divide-y divide-border">{active.slice(0, 5).map((i) => <InvestigationRow key={i.id} inv={i} />)}</div>
                : <CardBody><EmptyState icon={<Search />} title="No investigations yet." description="Describe a problem and CodeMind will investigate the repository." action={<StartInvestigationButton />} /></CardBody>}
            </Card>

            <Card>
              <CardHeader icon={<Activity className="size-4" />} title="Recent activity" />
              {activity.length ? (
                <ol className="divide-y divide-border">
                  {activity.map((a) => { const Icon = activityIcon[a.kind]; return (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted"><Icon className="size-4" /></span><span className="flex-1 text-sm">{a.text}</span><span className="shrink-0 text-xs text-subtle">{a.at}</span></li>
                  ); })}
                </ol>
              ) : <CardBody><p className="text-sm text-muted">No activity recorded yet. Indexing, investigations, validations and pull requests will show up here as they happen.</p></CardBody>}
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Repository" actions={<Link href={`/projects/${project.id}`} className="text-xs font-medium text-accent-strong hover:underline">Open</Link>} />
              <CardBody>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <Stat label="Framework" value={project.framework ?? "—"} />
                  <Stat label="Language" value={project.language ?? "—"} />
                  <Stat label="Dependencies" value={project.dependencies ?? "—"} />
                  <Stat label="Last indexed" value={project.lastIndexed ?? "Never"} />
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Pipeline" description="Across all projects" />
              <CardBody className="grid grid-cols-3 gap-3 text-center">
                {[{ label: "Investigations", n: investigations.length, href: "/investigations" }, { label: "Incidents", n: incidents.length, href: "/incidents" }, { label: "Pull requests", n: prs.length, href: "/pull-requests" }].map((t) => (
                  <Link key={t.label} href={t.href} className="rounded-xl border border-border bg-surface-2 px-2 py-3 transition-all hover:-translate-y-px hover:border-border-strong">
                    <div className="text-2xl font-semibold tabular-nums">{t.n}</div>
                    <div className="mt-0.5 text-xs text-muted">{t.label}</div>
                  </Link>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Repository health" actions={<Badge tone="warning">Sample data</Badge>} />
              <CardBody className="space-y-5">
                <div className="flex items-center gap-5">
                  <ScoreRing value={SAMPLE_HEALTH.overall} label="overall" />
                  <p className="text-sm text-muted">Health scores are placeholders until repository analysis can back each number with evidence.</p>
                </div>
                <div className="space-y-3.5">{SAMPLE_HEALTH.categories.map((c) => <ScoreBar key={c.label} label={c.label} value={c.value} />)}</div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
