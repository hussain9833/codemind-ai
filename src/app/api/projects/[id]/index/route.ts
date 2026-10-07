import { json, authorizeProjectRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { githubConfigured } from "@/lib/env";
import { IndexError, indexRepository } from "@/lib/repo/service";

export const dynamic = "force-dynamic";
// Vercel: indexing runs inside this request. Large repositories need a background queue (Phase 6).
export const maxDuration = 300;

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  const r = await db.repository.findUnique({ where: { id: a.repository!.id }, select: { indexStatus: true, indexProgress: true, indexError: true, lastIndexedAt: true, lastIndexedSha: true, indexedBranch: true, indexStats: true } });
  return json(r);
}

/** Starts (or restarts) indexing for the project's selected branch. */
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  if (!a.repository) return json({ error: "Project has no repository" }, { status: 409 });
  if (!githubConfigured()) return json({ error: "GitHub App is not configured on the server" }, { status: 503 });
  try {
    await indexRepository(a.repository.id, a.project.branch);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof IndexError) return json({ error: e.message, code: e.code }, { status: e.code === "already-indexing" ? 409 : 502 });
    throw e;
  }
}
