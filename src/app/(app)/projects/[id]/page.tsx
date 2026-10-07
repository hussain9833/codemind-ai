import { notFound } from "next/navigation";
import { FileCode2, GitBranch, GitPullRequest, MessageSquare, Network, Search } from "lucide-react";
import Link from "next/link";
import { HealthScore, RepoStatusBadge } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, PageHeader, ScoreBar, Stat } from "@/components/ui/card";
import { StartInvestigationButton } from "@/components/features/start-investigation";
import { EmptyState } from "@/components/ui/states";
import { LinkButton } from "@/components/ui/button";
import { InvestigationRow } from "@/components/features/lists";
import { SAMPLE_HEALTH } from "@/data/sample-health";
import { AnalysisView } from "@/components/features/analysis-view";
import { IndexPanel } from "@/components/features/index-panel";
import { getRepoState } from "@/lib/repo-status";
import { getInvestigations, getProject, getPullRequests } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { requireProject } from "@/lib/authz";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const owned = await requireProject(user.id, id);
  const repoState = owned.repository ? await getRepoState(owned.repository.id) : null;
  const project = await getProject(user.id, id);
  if (!project) notFound();
  const investigations = await getInvestigations(user.id, id);
  const prs = (await getPullRequests(user.id)).filter((p) => p.projectId === id);

  return (
    <>
      <PageHeader
        breadcrumb={<Link href="/projects">Projects</Link>}
        eyebrow="Project"
        title={<span className="flex flex-wrap items-center gap-3">{project.name} <RepoStatusBadge status={project.status} /></span>}
        description={<span className="flex flex-wrap items-center gap-x-4 gap-y-1"><span className="font-mono">{project.repository}</span><span className="flex items-center gap-1"><GitBranch className="size-3.5" />{project.branch}</span></span>}
        actions={<><LinkButton href="/ask" icon={<MessageSquare className="size-4" />}>Ask</LinkButton><LinkButton href="/repository" icon={<FileCode2 className="size-4" />}>Explore code</LinkButton><StartInvestigationButton /></>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Overview" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <Stat label="Framework" value={project.framework ?? "—"} />
                <Stat label="Language" value={project.language ?? "—"} />
                <Stat label="Dependencies" value={project.dependencies ?? "—"} />
                <Stat label="Last indexed" value={project.lastIndexed ?? "Never"} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Repository" description={repoState?.stats ? `${repoState.stats.filesIndexed} files · ${repoState.stats.symbols} symbols · ${repoState.stats.chunks} chunks${repoState.sha ? ` @ ${repoState.sha.slice(0, 7)}` : ""}` : "Index the repository to enable search and evidence"} />
            <CardBody>{repoState && <IndexPanel projectId={project.id} initial={repoState.status} />}</CardBody>
          </Card>

          <Card>
            <CardHeader icon={<Search className="size-4" />} title="Recent investigations" actions={<Link href="/investigations" className="text-xs font-medium text-accent-strong hover:underline">View all</Link>} />
            {investigations.length ? <div className="divide-y divide-border">{investigations.map((i) => <InvestigationRow key={i.id} inv={i} />)}</div>
              : <CardBody><EmptyState icon={<Search />} title="No investigations yet." description="Describe a problem and CodeMind will investigate the repository." action={<StartInvestigationButton />} /></CardBody>}
          </Card>

          <Card>
            <CardHeader icon={<GitPullRequest className="size-4" />} title="Recent pull requests" />
            {prs.length ? (
              <ul className="divide-y divide-border">{prs.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="font-medium">{p.title}</span><span className="flex items-center gap-2 text-xs text-subtle"><Badge>{p.status}</Badge>{p.updatedAt}</span></li>)}</ul>
            ) : <CardBody><EmptyState icon={<GitPullRequest />} title="No pull requests" description="Pull requests appear here after a fix has been reviewed and approved by a human." /></CardBody>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Health" description="Sample data until analysis backs each score" actions={<HealthScore value={project.health} />} />
            <CardBody className="space-y-4">{SAMPLE_HEALTH.categories.map((c) => <ScoreBar key={c.label} label={c.label} value={c.value} />)}</CardBody>
          </Card>
          <Card>
            <CardHeader icon={<Network className="size-4" />} title="Architecture" description="Detected from the indexed repository" actions={<Link href="/architecture" className="text-xs font-medium text-accent-strong hover:underline">Details</Link>} />
            <CardBody className="space-y-2">
              {repoState?.analysis?.importantDirectories.length ? repoState.analysis.importantDirectories.slice(0, 6).map((d) => <div key={d.path} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"><span className="font-mono text-xs">{d.path}/</span><span className="text-xs text-muted">{d.role}</span></div>) : <p className="text-sm text-subtle">Available after the repository is indexed.</p>}
            </CardBody>
          </Card>
        </div>
      </div>
      {repoState?.analysis && <section className="mt-10" aria-label="Repository analysis"><h2 className="mb-4 text-lg font-semibold tracking-tight">Repository analysis</h2><AnalysisView analysis={repoState.analysis} /></section>}
    </>
  );
}
