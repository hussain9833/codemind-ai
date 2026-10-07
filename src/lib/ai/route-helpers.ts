import "server-only";
import { NextResponse } from "next/server";
import { nvidiaConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { trackedProvider } from "./execution";
import { getAIProvider } from "./nvidia";
import { AIError } from "./types";

/** Tracked provider for a request, or a ready-made error response. */
export function aiFor(userId: string, projectId: string, investigationId?: string) {
  if (!nvidiaConfigured()) return { error: NextResponse.json({ error: "AI is not configured on the server (NVIDIA_API_KEY is missing).", code: "not_configured" }, { status: 503 }) } as const;
  return { ai: trackedProvider(getAIProvider(), { userId, projectId, investigationId }) } as const;
}

/** Maps provider failures to honest, non-leaky HTTP responses. */
export function aiErrorResponse(e: unknown, event: string) {
  if (e instanceof AIError) {
    const status = e.code === "rate_limited" ? 429 : e.code === "not_configured" ? 503 : e.code === "auth" || e.code === "quota" ? 502 : e.code === "bad_request" ? 400 : 502;
    const message = e.code === "timeout" || e.code === "unavailable" ? "The AI service did not respond. Try again in a moment." : e.code === "auth" || e.code === "quota" ? "The AI service rejected the server's credentials or quota." : e.message;
    log.warn(event, { code: e.code });
    return NextResponse.json({ error: message, code: e.code }, { status });
  }
  log.error(event, { error: e instanceof Error ? e.message : "unknown" });
  return NextResponse.json({ error: "Unexpected server error", code: "internal" }, { status: 500 });
}
