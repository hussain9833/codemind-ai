import { MessageSquare } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { AskPanel } from "@/components/features/ask-panel";
import { IndexPanel } from "@/components/features/index-panel";
import { getProjects } from "@/lib/api";
import { findOwnedProject } from "@/lib/authz";
import { nvidiaConfigured } from "@/lib/env";
import { getRepoState } from "@/lib/repo-status";
import { getSelectedProjectId } from "@/lib/selected-project";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Ask CodeMind" };

export default async function AskPage() {
  const user = await requireUser();
  const id = await getSelectedProjectId(await getProjects(user.id));
  const project = id ? await findOwnedProject(user.id, id) : null;
  const header = <PageHeader title="Ask CodeMind" description="Repository-aware answers backed by evidence you can open." />;

  if (!project?.repository) return (<>{header}<EmptyState icon={<MessageSquare className="size-8" />} title="No project selected" description="Create a project from a GitHub repository first." action={<LinkButton href="/projects/new" variant="primary">Create Project</LinkButton>} /></>);
  if (!nvidiaConfigured()) return (<>{header}<EmptyState title="AI is not configured" description="The server has no NVIDIA API key, so questions cannot be answered. Repository search still works in the Explorer." action={<LinkButton href="/repository">Open Explorer</LinkButton>} /></>);
  const state = await getRepoState(project.repository.id);
  if (state?.status.indexStatus !== "INDEXED") return (<>{header}<div className="mx-auto max-w-lg py-6"><IndexPanel projectId={project.id} initial={state!.status} /></div></>);
  return (<>{header}<AskPanel projectId={project.id} repository={project.repository.fullName} /></>);
}
