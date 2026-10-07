import { z } from "zod";
import { authorizeProjectRequest, json } from "@/lib/api-auth";
import { answerQuestion } from "@/lib/ai/chat";
import { aiErrorResponse, aiFor } from "@/lib/ai/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  question: z.string().trim().min(3).max(1500),
  history: z.array(z.object({ question: z.string().max(1500), answer: z.string().max(8000) })).max(6).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeProjectRequest((await ctx.params).id);
  if ("error" in a) return a.error;
  if (!a.repository || a.repository.indexStatus !== "INDEXED") return json({ error: "Index the repository before asking questions", code: "not-indexed" }, { status: 409 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Enter a question (3–1500 characters)" }, { status: 400 });
  const ai = aiFor(a.user.id, a.project.id);
  if ("error" in ai) return ai.error;
  try {
    return json(await answerQuestion({ repositoryId: a.repository.id, question: parsed.data.question, history: parsed.data.history, ai: ai.ai }));
  } catch (e) { return aiErrorResponse(e, "ai.chat.failed"); }
}
