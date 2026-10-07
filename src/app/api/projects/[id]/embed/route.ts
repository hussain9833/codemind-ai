import { authorizeProjectRequest, json } from "@/lib/api-auth";
import { embedRepository } from "@/lib/ai/embed-repo";
import { aiErrorResponse, aiFor } from "@/lib/ai/route-helpers";
import { embeddingCounts } from "@/lib/ai/vector";
import { nvidiaConfigured } from "@/lib/env";
import { getAIProvider } from "@/lib/ai/nvidia";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Semantic index progress (embedded chunks / total chunks). */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  if (!a.repository) return json({ configured: false, embedded: 0, total: 0 });
  if (!nvidiaConfigured()) return json({ configured: false, embedded: 0, total: 0 });
  try {
    const { model, dimension } = await getAIProvider().embeddingInfo();
    return json({ configured: true, model, dimension, ...(await embeddingCounts(a.repository.id, model)) });
  } catch (e) { return aiErrorResponse(e, "ai.embed.status_failed"); }
}

/** Builds (or continues building) the semantic index. Resumable: call again until `done`. */
export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  if (!a.repository || a.repository.indexStatus !== "INDEXED") return json({ error: "Index the repository first", code: "not-indexed" }, { status: 409 });
  const ai = aiFor(a.user.id, a.project.id);
  if ("error" in ai) return ai.error;
  try {
    return json(await embedRepository(a.repository.id, ai.ai));
  } catch (e) { return aiErrorResponse(e, "ai.embed.failed"); }
}
