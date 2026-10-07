/** Deterministic query understanding (no LLM): tokens, identifiers, paths, phrases, concept expansion. */

export interface QueryTerm { term: string; weight: number; origin: "query" | "concept" }

export interface ParsedQuery {
  raw: string;
  terms: QueryTerm[];
  /** Quoted phrases (exact, case-insensitive). */
  phrases: string[];
  /** Tokens that look like code identifiers (camelCase, snake_case, PascalCase, with ()). */
  identifiers: string[];
  /** Tokens that look like paths or file names. */
  paths: string[];
  /** Possible commit SHAs (7–40 hex). */
  shas: string[];
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those", "how", "why", "what", "where", "when", "which", "who", "does", "do", "did", "can", "could", "should", "would", "find", "show", "me", "all", "everything", "related", "about", "any", "my", "our", "i", "we", "you", "from", "by", "at", "as", "get", "gets", "there", "than", "then", "so", "not", "no", "but", "if", "into", "out", "up", "after", "before", "returns", "return", "happens", "happen", "wrong", "issue", "problem", "bug", "error", "fails", "failing", "fail"]);

/** Concept → related words. Expansion terms are weighted lower than words the user typed. */
const CONCEPTS: Record<string, string[]> = {
  auth: ["authentication", "authorization", "authorize", "login", "logout", "signin", "signup", "session", "token", "jwt", "password", "credential", "oauth", "middleware", "bcrypt", "passport", "cookie", "user"],
  authentication: ["auth", "login", "logout", "signin", "signup", "session", "token", "jwt", "password", "credential", "oauth", "middleware", "bcrypt", "passport", "cookie", "user"],
  authorization: ["auth", "permission", "role", "access", "policy", "guard", "ownership"],
  login: ["auth", "signin", "session", "password", "token", "credential"],
  logout: ["auth", "signout", "session", "token"],
  session: ["auth", "cookie", "token", "login"],
  token: ["jwt", "auth", "refresh", "session", "bearer"],
  jwt: ["token", "auth", "sign", "verify", "jose", "jsonwebtoken"],
  password: ["hash", "bcrypt", "scrypt", "argon2", "credential", "auth"],
  database: ["db", "sql", "query", "prisma", "model", "schema", "migration", "orm", "postgres", "repository"],
  db: ["database", "sql", "query", "prisma", "model", "schema", "migration"],
  api: ["route", "endpoint", "handler", "controller", "request", "response"],
  payment: ["billing", "stripe", "invoice", "checkout", "charge"],
  test: ["spec", "jest", "vitest", "pytest", "expect", "assert"],
  cache: ["redis", "memo", "ttl", "invalidate"],
  email: ["mail", "smtp", "sendgrid", "resend", "notification"],
  upload: ["file", "multipart", "storage", "s3", "blob"],
  config: ["configuration", "env", "settings", "environment"],
  error: ["exception", "throw", "catch", "handler"],
};

const camelSplit = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
const stem = (w: string) => (w.length > 5 ? w.replace(/(ing|ed|es|s)$/, "") : w);

export function parseQuery(raw: string): ParsedQuery {
  const phrases = [...raw.matchAll(/"([^"]{2,})"|'([^']{2,})'/g)].map((m) => (m[1] ?? m[2])!.toLowerCase());
  const stripped = raw.replace(/"[^"]*"|'[^']*'/g, " ");

  const rawTokens = stripped.split(/[\s,;:!?()[\]{}<>]+/).filter(Boolean);
  const identifiers: string[] = [];
  const paths: string[] = [];
  const shas: string[] = [];
  for (const t of rawTokens) {
    const clean = t.replace(/^[.`]+|[.`]+$/g, "");
    if (/^[0-9a-f]{7,40}$/i.test(clean) && /\d/.test(clean) && /[a-f]/i.test(clean)) shas.push(clean.toLowerCase());
    else if (/[\\/]/.test(clean) || /\.[a-z]{1,5}$/i.test(clean)) paths.push(clean.replace(/^\.?\//, ""));
    else if (/^[a-z]+[A-Z]|^[A-Z][a-z]+[A-Z]|_/.test(clean) && clean.length > 3) identifiers.push(clean);
    else if (/\w\(\)$/.test(t)) identifiers.push(clean.replace(/\(\)$/, ""));
  }

  const terms = new Map<string, QueryTerm>();
  const add = (term: string, weight: number, origin: QueryTerm["origin"]) => {
    const t = term.toLowerCase();
    if (t.length < 2 || STOP.has(t)) return;
    const prev = terms.get(t);
    if (!prev || prev.weight < weight) terms.set(t, { term: t, weight, origin });
  };

  for (const token of [...rawTokens, ...identifiers]) {
    for (const w of camelSplit(token.replace(/[_\-./\\]+/g, " ")).split(/\s+/)) {
      const lw = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!lw || STOP.has(lw)) continue;
      add(lw, 1, "query");
      const s = stem(lw);
      if (s !== lw && s.length >= 3) add(s, 0.8, "query");
    }
  }
  for (const [k, q] of [...terms]) {
    for (const rel of CONCEPTS[k] ?? CONCEPTS[q.term] ?? []) add(rel, 0.5 * q.weight, "concept");
  }
  for (const p of phrases) add(p, 1.2, "query");

  return { raw, terms: [...terms.values()].sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term)), phrases, identifiers, paths, shas };
}

/** Split an identifier or path into lowercase word parts for matching. */
export const words = (s: string) => camelSplit(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
