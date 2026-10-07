import { after } from "next/server";
import { z } from "zod";
import { authorizeProjectRequest, json } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { runInvestigation } from "@/lib/ai/investigate";
import { aiFor } from "@/lib/ai/route-helpers";
import { assertWithinRateLimit } from "@/lib/ai/execution";
import { AIError } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
// The investigation continues after the response is sent (via after()), so allow the full window.
export const maxDuration = 300;

const body = z.object({
  problem: z.string().trim().min(15, "Describe the problem in at least a sentence").max(4000),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
});

/** Creates an investigation and starts it. Returns immediately; the UI follows progress via the timeline. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  if (!a.repository || a.repository.indexStatus !== "INDEXED") return json({ error: "Index the repository before starting an investigation", code: "not-indexed" }, { status: 409 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const first = aiFor(a.user.id, a.project.id);
  if ("error" in first) return first.error;
  try { await assertWithinRateLimit(a.user.id); } catch (e) { if (e instanceof AIError) return json({ error: e.message, code: e.code }, { status: 429 }); throw e; }

  const title = parsed.data.problem.replace(/\s+/g, " ").slice(0, 90);
  const inv = await db.investigation.create({
    data: { projectId: a.project.id, title, problem: parsed.data.problem, severity: parsed.data.severity, status: "INVESTIGATING", events: { create: { type: "problem", label: "Problem received", detail: `Severity ${parsed.data.severity}` } } },
    select: { id: true },
  });

  const tracked = aiFor(a.user.id, a.project.id, inv.id);
  if ("error" in tracked) return tracked.error;
  after(() => runInvestigation(inv.id, tracked.ai));
  return json({ id: inv.id }, { status: 202 });
}
