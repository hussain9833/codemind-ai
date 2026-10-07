import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { embedRepository } from "../embed-repo";
import { trackedProvider, type ExecContext } from "../execution";
import { runInvestigation } from "../investigate";
import { getAIProvider } from "../nvidia";
import { db } from "@/lib/db";
import { buildIndex } from "@/lib/repo/pipeline";
import { persistIndex } from "@/lib/repo/service";
import { localCommits, localSource } from "@/lib/repo/sources/local";

/** LIVE: investigation of a repository with a planted, realistic bug (CM_BUG_REPO). */
const root = process.env.CM_BUG_REPO;
const live = !!process.env.CM_LIVE_AI && !!root && existsSync(root) && !!process.env.NVIDIA_API_KEY;

describe.skipIf(!live)("live investigation: planted bug", () => {
  const email = `bug-${Date.now()}@cm-test.dev`;
  let ctx: ExecContext;
  let repositoryId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email, passwordHash: "x" } });
    const project = await db.project.create({ data: { userId: user.id, name: "bug", branch: "main", repository: { create: { githubRepoId: BigInt(12), githubInstallationId: BigInt(12), owner: "o", name: "rw", fullName: "o/rw", defaultBranch: "main", isPrivate: false, htmlUrl: "https://github.com/o/rw", indexStatus: "INDEXED", indexedBranch: "main", lastIndexedSha: "abc1234567" } } }, include: { repository: true } });
    repositoryId = project.repository!.id;
    ctx = { userId: user.id, projectId: project.id };
    const built = await buildIndex(localSource(root!));
    await db.repository.update({ where: { id: repositoryId }, data: { analysis: built.analysis as never } });
    await persistIndex(repositoryId, built, localCommits(root!));
    await embedRepository(repositoryId, trackedProvider(getAIProvider(), ctx), 200_000);
  }, 280_000);

  afterAll(async () => { await db.user.deleteMany({ where: { email } }); await db.$disconnect(); });

  it("finds the planted root cause with cited evidence", async () => {
    const problem = "In production, where JWT_SECRET is configured, logged-in users get a 401 'invalid signature' error on endpoints where authentication is optional (e.g. listing articles and viewing profiles). Protected endpoints like GET /user work fine with the same token. Locally, with no JWT_SECRET set, everything works.";
    const inv = await db.investigation.create({ data: { projectId: ctx.projectId, title: problem.slice(0, 80), problem, status: "INVESTIGATING", events: { create: { type: "problem", label: "Problem received" } } } });
    await runInvestigation(inv.id, trackedProvider(getAIProvider(), { ...ctx, investigationId: inv.id }));
    const r = await db.investigation.findUniqueOrThrow({ where: { id: inv.id }, include: { events: { orderBy: { createdAt: "asc" } }, hypotheses: { include: { links: true } }, evidence: true } });
    console.log("STATUS", r.status, r.rootCauseLevel);
    console.log("TIMELINE\n" + r.events.map((e) => `  ${e.type.padEnd(14)} ${e.label} — ${(e.detail ?? "").slice(0, 170)}`).join("\n"));
    console.log("HYPOTHESES\n" + r.hypotheses.map((h) => `  [${h.likelihood}/${h.status}${h.isRootCause ? "/ROOT" : ""}] ${h.title}`).join("\n"));
    console.log("ROOT CAUSE:\n" + r.rootCause);
    console.log("DETAIL:", JSON.stringify(r.rootCauseDetail, null, 1).slice(0, 1800));
    expect(r.status).toBe("ROOT_CAUSE");
    const d = r.rootCauseDetail as { files: string[]; supportingEvidenceIds: string[] };
    expect(d.files.join(" ")).toContain("auth/auth.ts");
    expect(/JWT_SECRET_KEY/.test(r.rootCause ?? "") || r.evidence.some((e) => /JWT_SECRET_KEY/.test(e.excerpt ?? ""))).toBe(true);
    expect(d.supportingEvidenceIds.length).toBeGreaterThan(0);
  }, 480_000);
});
