import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { dbReader } from "@/lib/repo/db-reader";
import { parseQuery } from "@/lib/repo/query";
import { RepoSearch } from "@/lib/repo/search";
import { cookies } from "next/headers";
import type { SearchResult } from "@/lib/search";

export const dynamic = "force-dynamic";

/** Global (Ctrl+K) search. Everything is scoped to the signed-in user's projects. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  const like = { contains: q, mode: "insensitive" as const };
  const own = { project: { userId: user.id, archivedAt: null } };
  const out: SearchResult[] = [];

  const [projects, investigations, incidents, prs] = await Promise.all([
    db.project.findMany({ where: { userId: user.id, archivedAt: null, ...(q ? { OR: [{ name: like }, { repository: { fullName: like } }] } : {}) }, include: { repository: { select: { fullName: true } } }, take: 5, orderBy: { updatedAt: "desc" } }),
    q ? db.investigation.findMany({ where: { ...own, title: like }, take: 5, select: { id: true, title: true } }) : [],
    q ? db.incident.findMany({ where: { ...own, title: like }, take: 5, select: { id: true, title: true } }) : [],
    q ? db.pullRequest.findMany({ where: { ...own, title: like }, take: 5, select: { id: true, title: true, branch: true } }) : [],
  ]);
  out.push(...projects.map((p): SearchResult => ({ id: p.id, kind: "project", title: p.name, subtitle: p.repository?.fullName, href: `/projects/${p.id}` })));
  out.push(...investigations.map((i): SearchResult => ({ id: i.id, kind: "investigation", title: i.title, href: `/investigations/${i.id}` })));
  out.push(...incidents.map((i): SearchResult => ({ id: i.id, kind: "incident", title: i.title, href: "/incidents" })));
  out.push(...prs.map((p): SearchResult => ({ id: p.id, kind: "pull-request", title: p.title, subtitle: p.branch, href: "/pull-requests" })));

  // Code-level kinds come from the selected project's index.
  const cookieId = decodeURIComponent((await cookies()).get("cm_project")?.value ?? "");
  const selected = cookieId || (await db.project.findFirst({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id;
  if (q && selected) {
    const project = await db.project.findFirst({ where: { id: selected, userId: user.id, archivedAt: null }, include: { repository: true } });
    if (project?.repository?.indexStatus === "INDEXED") {
      const search = await RepoSearch.load(dbReader(project.repository.id));
      const pq = parseQuery(q);
      out.push(...search.searchFiles(pq, 5).map((m): SearchResult => ({ id: `f:${m.file.path}`, kind: "file", title: m.file.path, subtitle: m.file.language, href: `/repository?file=${encodeURIComponent(m.file.path)}` })));
      out.push(...search.searchSymbols(pq, 5).map((m): SearchResult => ({ id: `s:${m.symbol.filePath}:${m.symbol.name}:${m.symbol.lineStart}`, kind: "symbol", title: `${m.symbol.parent ? m.symbol.parent + "." : ""}${m.symbol.name}`, subtitle: `${m.symbol.filePath}:${m.symbol.lineStart}`, href: `/repository?file=${encodeURIComponent(m.symbol.filePath)}&line=${m.symbol.lineStart}&end=${m.symbol.lineEnd}` })));
      out.push(...search.searchGit(pq, 4).map((g): SearchResult => ({ id: `c:${g.commit.sha}`, kind: "commit", title: g.commit.message.split("\n")[0]!, subtitle: g.commit.sha.slice(0, 7), href: `${project.repository!.htmlUrl}/commit/${g.commit.sha}` })));
    }
  }
  return NextResponse.json({ results: out });
}
