import "server-only";

/**
 * Minimal structured logger (one JSON line per event). Never pass secrets or prompts:
 * values for keys that look sensitive are redacted defensively.
 */
const SENSITIVE = /(token|secret|password|authorization|api[-_]?key|private[-_]?key|cookie)/i;

function clean(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "…" : value.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]");
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : clean(v, depth + 1)]));
  return value;
}

function emit(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(clean(fields) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
