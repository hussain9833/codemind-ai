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

/** LIVE: full investigation (real NVIDIA + Neon). CM_LIVE_AI=1 CM_FIXTURE_REPO=... node scripts/with-env.mjs npx vitest run investigate.live */
const root = process.env.CM_FIXTURE_REPO;
const live = !!process.env.CM_LIVE_AI && !!root && existsSync(root) && !!process.env.NVIDIA_API_KEY;

describe.skipIf(!live)("live investigation", () => {
  const email = `inv-${Date.now()}@cm-test.dev`;
  let ctx: ExecContext;
  let repositoryId: string;

  beforeAll(async () => {
    const user = await db.user.create({ data: { email, passwordHash: "x" } });
    const project = await db.project.create({ data: { userId: user.id, name: "inv", branch: "main", repository: { create: { githubRepoId: BigInt(11), githubInstallationId: BigInt(11), owner: "o", name: "rw", fullName: "o/rw", defaultBranch: "main", isPrivate: false, htmlUrl: "https://github.com/o/rw", indexStatus: "INDEXED", indexedBranch: "main", lastIndexedSha: "abc1234567" } } }, include: { repository: true } });
    repositoryId = project.repository!.id;
    ctx = { userId: user.id, projectId: project.id };
    const built = await buildIndex(localSource(root!));
    await db.repository.update({ where: { id: repositoryId }, data: { analysis: built.analysis as never } });
    await persistIndex(repositoryId, built, localCommits(root!));
    await embedRepository(repositoryId, trackedProvider(getAIProvider(), ctx), 200_000);
  }, 280_000);

  afterAll(async () => { await db.user.deleteMany({ where: { email } }); await db.$disconnect(); });

  const start = async (problem: string) => {
    const inv = await db.investigation.create({ data: { projectId: ctx.projectId, title: problem.slice(0, 80), problem, status: "INVESTIGATING", events: { create: { type: "problem", label: "Problem received" } } } });
    await runInvestigation(inv.id, trackedProvider(getAIProvider(), { ...ctx, investigationId: inv.id }));
    return db.investigation.findUniqueOrThrow({ where: { id: inv.id }, include: { events: { orderBy: { createdAt: "asc" } }, hypotheses: { include: { links: true } }, evidence: true } });
  };

  it("investigates a real auth problem with evidence, hypotheses and a validated root cause", async () => {
    const r = await start("Authenticated API requests are rejected with 401 even though the client sends a valid 'Authorization: Bearer <token>' header. Login itself works and returns a token.");
    console.log("STATUS", r.status, r.rootCauseLevel);
    console.log("TIMELINE\n" + r.events.map((e) => `  ${e.type.padEnd(14)} ${e.label} — ${e.detail ?? ""}`).join("\n"));
    console.log("HYPOTHESES\n" + r.hypotheses.map((h) => `  [${h.likelihood}/${h.status}] ${h.title} (support ${h.links.filter((l) => l.stance === "SUPPORTS").length}, contra ${h.links.filter((l) => l.stance === "CONTRADICTS").length})`).join("\n"));
    console.log("ROOT CAUSE:", r.rootCause?.slice(0, 700));
    console.log("DETAIL:", JSON.stringify(r.rootCauseDetail).slice(0, 700));
    console.log("EVIDENCE sample:", r.evidence.slice(0, 5).map((e) => `${e.type} ${e.title}`));

    expect(r.evidence.length).toBeGreaterThan(3);
    expect(r.hypotheses.length).toBeGreaterThan(0);
    expect(["ROOT_CAUSE", "INCONCLUSIVE"]).toContain(r.status);
    // every evidence row is locatable and was really in the index
    const files = new Set((await db.repoFile.findMany({ where: { repositoryId }, select: { path: true } })).map((f) => f.path));
    for (const e of r.evidence) if (e.filePath) expect(files.has(e.filePath)).toBe(true);
    for (const h of r.hypotheses) for (const l of h.links) expect(r.evidence.some((e) => e.id === l.evidenceId)).toBe(true);
    if (r.status === "ROOT_CAUSE") {
      const d = r.rootCauseDetail as { files: string[]; supportingEvidenceIds: string[] };
      for (const f of d.files) expect(files.has(f)).toBe(true);
      expect(d.supportingEvidenceIds.length).toBeGreaterThan(0);
    }
    const types = r.events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["problem", "repository_loaded", "plan", "evidence", "hypotheses"]));
  }, 290_000);

  it("reports insufficient evidence for a problem the repository cannot explain", async () => {
    const r = await start("The nightly PDF invoice email is not delivered to customers on weekends and the SMTP relay logs show a timeout.");
    console.log("STATUS", r.status, "| rootCause:", r.rootCause, "| detail:", JSON.stringify(r.rootCauseDetail).slice(0, 400));
    console.log("TIMELINE\n" + r.events.map((e) => `  ${e.type.padEnd(14)} ${e.label} — ${(e.detail ?? "").slice(0, 100)}`).join("\n"));
    expect(r.status).not.toBe("ROOT_CAUSE");
    expect(r.rootCause).toBeNull();
  }, 290_000);
});
