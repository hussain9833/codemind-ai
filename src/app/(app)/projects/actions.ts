"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { GithubError, listBranches, listRepositories } from "@/lib/github";
import { requireUser } from "@/lib/session";

export interface CreateProjectState { error?: string }

const schema = z.object({
  installationId: z.coerce.number().int().positive(),
  repoId: z.coerce.number().int().positive(),
  branch: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1, "Enter a project name").max(80),
});

/**
 * Creates a project. Nothing from the form is trusted: the user, installation, repository
 * and branch are all re-verified against GitHub using the *user's* token, and the
 * repository metadata stored comes from GitHub, not from the request.
 */
export async function createProjectAction(_: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { installationId, repoId, branch, name } = parsed.data;

  let projectId: string;
  try {
    const repos = await listRepositories(user.id, installationId);
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) return { error: "You don't have access to that repository through this GitHub App installation." };

    const branches = await listBranches(user.id, repo.owner, repo.name);
    if (!branches.includes(branch)) return { error: `Branch “${branch}” was not found in ${repo.fullName}.` };

    const existing = await db.project.findFirst({ where: { userId: user.id, archivedAt: null, repository: { githubRepoId: BigInt(repo.id) } }, select: { id: true } });
    if (existing) return { error: `${repo.fullName} is already a CodeMind project.` };

    const project = await db.project.create({
      data: {
        userId: user.id,
        name,
        branch,
        repository: {
          create: {
            githubRepoId: BigInt(repo.id),
            githubInstallationId: BigInt(installationId),
            owner: repo.owner,
            name: repo.name,
            fullName: repo.fullName,
            defaultBranch: repo.defaultBranch,
            isPrivate: repo.private,
            htmlUrl: repo.htmlUrl,
            language: repo.language,
          },
        },
      },
      select: { id: true },
    });
    projectId = project.id;
  } catch (e) {
    if (e instanceof GithubError) {
      if (e.code === "forbidden") return { error: "GitHub denied access. Check that the GitHub App is installed on this repository." };
      if (e.code === "unavailable") return { error: "GitHub is unavailable right now. Try again in a moment." };
      return { error: "Your GitHub authorization expired. Reconnect GitHub and try again." };
    }
    console.error("create project failed", e instanceof Error ? e.message : "unknown");
    return { error: "We couldn't save the project. Check that the database is reachable and try again." };
  }
  redirect(`/projects/${projectId}`);
}
