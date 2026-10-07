import { z } from "zod";
import { AIError, type ChatMessage, type ChatOptions, type ChatResult } from "./types";

/** Extracts the first balanced JSON object from model text (handles ```json fences and prose around it). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) throw new AIError("invalid_output", "Model did not return JSON");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i]!;
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { throw new AIError("invalid_output", "Model returned malformed JSON"); }
    }
  }
  throw new AIError("invalid_output", "Model returned truncated JSON");
}

type ChatFn = (messages: ChatMessage[], options?: ChatOptions) => Promise<ChatResult>;

/**
 * Structured output: parse + validate against a zod schema. One repair attempt is made by
 * showing the model its own validation error; after that the call fails (callers decide the fallback).
 */
export async function chatJSON<S extends z.ZodTypeAny>(chat: ChatFn, messages: ChatMessage[], schema: S, options?: ChatOptions): Promise<{ data: z.infer<S>; result: ChatResult }> {
  let last: ChatResult | undefined;
  let convo = messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chat(convo, options);
    last = result;
    try {
      const parsed = schema.safeParse(extractJson(result.text));
      if (parsed.success) return { data: parsed.data, result };
      const issue = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      convo = [...messages, { role: "assistant", content: result.text.slice(0, 4000) }, { role: "user", content: `Your reply did not match the required JSON format (${issue}). Reply again with ONLY the corrected JSON object.` }];
    } catch (e) {
      if (!(e instanceof AIError) || e.code !== "invalid_output") throw e;
      convo = [...messages, { role: "assistant", content: result.text.slice(0, 4000) }, { role: "user", content: "Your reply was not valid JSON. Reply again with ONLY the JSON object, no commentary." }];
    }
  }
  throw new AIError("invalid_output", `Model output failed validation${last ? ` (model ${last.model})` : ""}`);
}
