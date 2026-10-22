import "server-only";

/**
 * Small in-memory sliding-window limiter for sensitive forms. It is per server instance
 * (serverless instances do not share memory), so it slows guessing but is not a hard guarantee;
 * a shared store (Redis / DB) should replace it before wide public use.
 */
const hits = new Map<string, number[]>();

export function tooManyAttempts(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t > windowMs)) hits.delete(k);
  return recent.length > max;
}
