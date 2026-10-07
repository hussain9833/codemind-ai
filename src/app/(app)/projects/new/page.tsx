import { Check, GitBranch, Lock } from "lucide-react";
import Link from "next/link";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/states";
import { NewProjectForm } from "@/components/features/new-project-form";
import { githubConfigured } from "@/lib/env";
import { getConnection, GithubError, installUrl, listBranches, listInstallations, listRepositories, type GhInstallation, type GhRepo } from "@/lib/github";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Create Project" };

const ERRORS: Record<string, string> = {
  state: "The GitHub sign-in could not be verified (it may have expired). Please try connecting again.",
  connect: "GitHub did not complete the connection. Please try again.",
};

function Steps({ current }: { current: number }) {
  const steps = ["Connect GitHub", "Installation", "Repository", "Branch"];
  return (
    <ol className="mb-7 flex flex-wrap items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "active" : "todo";
        return (
          <li key={s} aria-current={state === "active" ? "step" : undefined} className="flex items-center gap-2">
            <span className={`flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${state === "active" ? "border-accent/40 bg-accent-soft text-fg" : state === "done" ? "border-success/30 bg-success/10 text-success" : "border-border text-subtle"}`}>
              <span className={`grid size-5 place-items-center rounded-full text-xs ${state === "active" ? "bg-accent text-accent-fg" : state === "done" ? "bg-success text-accent-fg" : "bg-surface-3"}`}>{state === "done" ? <Check className="size-3" strokeWidth={3} /> : n}</span>
              {s}
            </span>
            {n < steps.length && <span aria-hidden className="h-px w-5 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

const reconnect = (
  <LinkButton href="/api/github/connect" plain variant="primary">Reconnect GitHub</LinkButton>
);

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ installation?: string; repo?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const header = <PageHeader breadcrumb={<Link href="/projects" className="hover:text-fg">Projects</Link>} title="Create Project" description="Connect a GitHub repository to start investigating it." />;

  if (!githubConfigured()) {
    return (<>{header}<ErrorState title="GitHub App is not configured" description="The server is missing GitHub App settings, so repositories can't be listed." causes={["GITHUB_APP_* or ENCRYPTION_KEY variables are not set", "The server wasn't restarted after editing .env.local"]} actions={<span className="text-xs text-muted">See .env.example and docs/GITHUB_APP.md.</span>} /></>);
  }

  const connection = await getConnection(user.id);
  const flash = sp.error && ERRORS[sp.error] ? <div className="mb-5"><InlineAlert>{ERRORS[sp.error]}</InlineAlert></div> : null;

  if (!connection) {
    return (
      <>
        {header}{flash}<Steps current={1} />
        <Card><CardBody className="flex flex-col items-start gap-3">
          <p className="max-w-md text-sm text-muted">CodeMind uses a GitHub App with read-only access. You choose which repositories it can see. Nothing is cloned or indexed yet.</p>
          <LinkButton href="/api/github/connect" plain variant="primary">Connect GitHub</LinkButton>
        </CardBody></Card>
      </>
    );
  }

  const data = await load(user.id, sp);

  if (data.kind === "error") {
    const map = {
      "token-expired": { title: "GitHub authorization expired", description: "CodeMind can no longer act on your behalf on GitHub.", causes: ["The authorization expired or was revoked in your GitHub settings"], actions: reconnect },
      forbidden: { title: "GitHub access denied", description: "GitHub refused this request.", causes: ["The GitHub App isn't installed on that account or repository", "You no longer have access to it"], actions: <LinkButton href="/projects/new">Start over</LinkButton> },
      unavailable: { title: "GitHub is unavailable", description: "CodeMind couldn't reach GitHub.", causes: ["GitHub may be experiencing an outage", "A network problem on the server"], actions: <LinkButton href="/projects/new">Retry</LinkButton> },
      "not-connected": { title: "GitHub not connected", description: "Connect your GitHub account first.", causes: [], actions: reconnect },
    }[data.code];
    return (<>{header}<ErrorState {...map} /></>);
  }

  const { installations, installation, repos, repo, branches } = data;

  if (!installation || !repos) {
    return (
      <>
        {header}{flash}<Steps current={2} />
        <Card>
          <CardHeader title="Select GitHub App installation" description={`Connected as @${connection.githubLogin}`} actions={<LinkButton href={installUrl()} plain size="sm">Install on another account</LinkButton>} />
          {installations.length ? (
            <ul className="divide-y divide-border">
              {installations.map((i) => (
                <li key={i.id}><Link href={`/projects/new?installation=${i.id}`} className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-surface-2">
                  <span className="text-sm font-medium">{i.account}</span><Badge>{i.repositorySelection === "all" ? "All repositories" : "Selected repositories"}</Badge>
                </Link></li>
              ))}
            </ul>
          ) : (
            <CardBody className="space-y-3"><p className="text-sm text-muted">The CodeMind GitHub App isn&apos;t installed on any account you can access. Install it and choose which repositories to share.</p><LinkButton href={installUrl()} plain variant="primary">Install GitHub App</LinkButton></CardBody>
          )}
        </Card>
      </>
    );
  }

  if (!repo || !branches) {
    return (
      <>
        {header}{flash}<Steps current={3} />
        <Card>
          <CardHeader title={`Repositories in ${installation.account}`} actions={<Link href="/projects/new" className="text-xs text-accent hover:underline">Change installation</Link>} />
          {repos.length ? (
            <ul className="divide-y divide-border">
              {repos.map((r) => (
                <li key={r.id}><Link href={`/projects/new?installation=${installation.id}&repo=${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2">
                  <span className="min-w-0"><span className="block truncate font-mono text-sm">{r.fullName}</span>{r.description && <span className="block truncate text-xs text-subtle">{r.description}</span>}</span>
                  <span className="flex shrink-0 items-center gap-2">{r.language && <span className="text-xs text-muted">{r.language}</span>}{r.private && <Badge><Lock className="size-3" /> Private</Badge>}</span>
                </Link></li>
              ))}
            </ul>
          ) : <CardBody><p className="text-sm text-muted">No repositories are shared with CodeMind in this installation. Update the installation on GitHub to add some.</p><div className="mt-3"><LinkButton href={installUrl()} plain>Manage on GitHub</LinkButton></div></CardBody>}
        </Card>
      </>
    );
  }

  return (
    <>
      {header}<Steps current={4} />
      <Card className="max-w-lg">
        <CardHeader title={repo.fullName} description={<span className="flex items-center gap-1"><GitBranch className="size-3" /> default branch {repo.defaultBranch}</span>} actions={<Link href={`/projects/new?installation=${installation.id}`} className="text-xs text-accent hover:underline">Change</Link>} />
        <CardBody>
          {branches.length ? <NewProjectForm installationId={installation.id} repoId={repo.id} defaultName={repo.name} branches={branches} defaultBranch={repo.defaultBranch} />
            : <p className="text-sm text-muted">This repository has no branches yet. Push a commit first, then try again.</p>}
        </CardBody>
      </Card>
    </>
  );
}

type Loaded =
  | { kind: "error"; code: GithubError["code"] }
  | { kind: "ok"; installations: GhInstallation[]; installation?: GhInstallation; repos?: GhRepo[]; repo?: GhRepo; branches?: string[] };

/** All GitHub I/O for the wizard. Every step is verified with the user's own token. */
async function load(userId: string, sp: { installation?: string; repo?: string }): Promise<Loaded> {
  try {
    const installations = await listInstallations(userId);
    const installation = installations.find((i) => i.id === Number(sp.installation));
    if (!installation) return { kind: "ok", installations };
    const repos = await listRepositories(userId, installation.id);
    const repo = repos.find((r) => r.id === Number(sp.repo));
    if (!repo) return { kind: "ok", installations, installation, repos };
    const branches = await listBranches(userId, repo.owner, repo.name);
    return { kind: "ok", installations, installation, repos, repo, branches };
  } catch (e) {
    if (e instanceof GithubError) return { kind: "error", code: e.code };
    throw e;
  }
}
