import { FolderGit2 } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { IndexPanel } from "@/components/features/index-panel";
import { RepoExplorer } from "@/components/features/repo-explorer";
import { getProjects } from "@/lib/api";
import { getRepoState } from "@/lib/repo-status";
import { getSelectedProjectId } from "@/lib/selected-project";
import { findOwnedProject } from "@/lib/authz";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Repository Explorer" };

export default async function RepositoryPage() {
  const user = await requireUser();
  const projects = await getProjects(user.id);
  const id = await getSelectedProjectId(projects);
  const project = id ? await findOwnedProject(user.id, id) : null;

  if (!project?.repository) {
    return (<><PageHeader title="Repository Explorer" description="Browse files and jump to evidence." /><EmptyState icon={<FolderGit2 className="size-8" />} title="No project selected" description="Create a project from a GitHub repository to explore its code." action={<LinkButton href="/projects/new" variant="primary">Create Project</LinkButton>} /></>);
  }
  const state = await getRepoState(project.repository.id);
  const indexed = state?.status.indexStatus === "INDEXED";

  return (
    <>
      <PageHeader title="Repository Explorer" description={`${project.repository.fullName} · ${state?.branch ?? project.branch}${state?.sha ? ` @ ${state.sha.slice(0, 7)}` : ""}`} actions={indexed && state ? <IndexPanel projectId={project.id} initial={state.status} compact /> : undefined} />
      {indexed ? (
        <Suspense fallback={<Skeleton className="h-[480px] w-full" />}><RepoExplorer projectId={project.id} /></Suspense>
      ) : state ? (
        <div className="mx-auto max-w-lg py-6"><IndexPanel projectId={project.id} initial={state.status} /></div>
      ) : null}
    </>
  );
}
