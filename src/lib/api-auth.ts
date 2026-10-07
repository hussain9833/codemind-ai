import "server-only";
import { NextResponse } from "next/server";
import { findOwnedProject } from "./authz";
import { getCurrentUser } from "./session";

/** For JSON route handlers: authenticate AND verify project ownership, or return the error response. */
export async function authorizeProjectRequest(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const project = await findOwnedProject(user.id, projectId);
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) } as const;
  return { user, project, repository: project.repository } as const;
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { ...init, headers: { "Cache-Control": "private, no-store", ...(init?.headers ?? {}) } });
