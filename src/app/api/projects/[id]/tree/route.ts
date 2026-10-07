import { json, authorizeProjectRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Flat file list; the client builds the tree and loads folders lazily from it. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  if (!a.repository) return json({ files: [] });
  const files = await db.repoFile.findMany({ where: { repositoryId: a.repository.id }, select: { path: true, language: true, category: true, size: true, lineCount: true }, orderBy: { path: "asc" } });
  return json({ files, indexedSha: a.repository.lastIndexedSha, status: a.repository.indexStatus });
}
