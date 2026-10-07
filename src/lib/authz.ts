import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";

/**
 * Single authorization choke point for project-scoped data.
 * Returns the project only if it belongs to `userId`; otherwise 404 (not 403, so the
 * existence of other users' projects is not revealed).
 */
export async function requireProject(userId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, archivedAt: null },
    include: { repository: true },
  });
  if (!project) notFound();
  return project;
}

/** Non-throwing variant for route handlers that return JSON. */
export async function findOwnedProject(userId: string, projectId: string) {
  return db.project.findFirst({ where: { id: projectId, userId, archivedAt: null }, include: { repository: true } });
}

/** Scope helper: always filter project-owned queries through the user. */
export const ownedProjects = (userId: string) => ({ project: { userId, archivedAt: null } });
