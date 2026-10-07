/**
 * SAMPLE DATA — Phase 1 UI development only.
 * Everything exported from this file is placeholder content. Real data will arrive
 * through the data-access layer in src/lib/api.ts (replace its implementations,
 * keep its signatures).
 */
import type { ActivityItem, Incident, Investigation, Project, PullRequest } from "@/lib/types";

export const SAMPLE_PROJECTS: Project[] = [
  { id: "payments-api", name: "payments-api", repository: "acme/payments-api", branch: "main", status: "indexed", health: 82, framework: "Next.js 15", language: "TypeScript", dependencies: 94, lastActivity: "12 min ago", lastIndexed: "2 hours ago", activeInvestigations: 2 },
  { id: "web-dashboard", name: "web-dashboard", repository: "acme/web-dashboard", branch: "develop", status: "indexing", health: 71, framework: "React 19", language: "TypeScript", dependencies: 132, lastActivity: "1 hour ago", lastIndexed: null, activeInvestigations: 1 },
  { id: "auth-service", name: "auth-service", repository: "acme/auth-service", branch: "main", status: "unavailable", health: 64, framework: "Express", language: "TypeScript", dependencies: 58, lastActivity: "3 days ago", lastIndexed: "3 days ago", activeInvestigations: 0 },
];

const noChecks = (): Investigation["validation"] => [
  { id: "v1", name: "Type Check", state: "not-run" },
  { id: "v2", name: "Lint", state: "not-run" },
  { id: "v3", name: "Tests", state: "not-run" },
  { id: "v4", name: "Security Scan", state: "not-run" },
];

export const SAMPLE_INVESTIGATIONS: Investigation[] = [
  {
    id: "inv-1042",
    projectId: "payments-api",
    title: "Users randomly logged out after token refresh",
    problem:
      "Since release 2.14, roughly 3% of sessions are terminated within minutes of a successful login. Affected users see a 401 on the next API call after a silent token refresh.",
    status: "root-cause",
    severity: "high",
    confidence: "high",
    createdAt: "Oct 5, 2026",
    lastActivity: "8 min ago",
    evidence: [
      { id: "e1", type: "file", title: "auth/middleware.ts", file: "src/auth/middleware.ts", lines: [11, 14], note: "JWT validation happens here. Expired tokens are rejected without checking the refresh grace window.", excerpt: "if (payload.exp < now) {\n  throw new AuthError(\"expired\");\n}" },
      { id: "e2", type: "symbol", title: "rotateRefreshToken()", file: "src/auth/tokens.ts", lines: [4, 11], symbol: "rotateRefreshToken", note: "Old refresh token is revoked before the new one is persisted." },
      { id: "e3", type: "commit", title: "a91f3c2 — Rotate refresh tokens on use", commit: "a91f3c2", note: "Introduced rotation in 2.14; first commit touching the revoke/persist ordering." },
      { id: "e4", type: "log", title: "auth-worker.log 14:02:11", note: "WARN refresh failed: token not found (jti=7f2c…) — concurrent request already rotated it." },
      { id: "e5", type: "test", title: "tokens.spec.ts › rotates once", file: "src/auth/tokens.spec.ts", lines: [5, 8], note: "No test covers two concurrent refresh requests." },
    ],
    hypotheses: [
      { id: "h1", title: "Refresh token rotation race", likelihood: "high", supporting: 4, contradicting: 0, summary: "Concurrent refresh calls rotate the same token twice; the loser is logged out.", selected: true },
      { id: "h2", title: "Clock skew between API nodes", likelihood: "medium", supporting: 1, contradicting: 1, summary: "exp comparison without leeway could reject valid tokens on drifted nodes." },
      { id: "h3", title: "Cookie SameSite change", likelihood: "low", supporting: 0, contradicting: 2, summary: "Browser cookie policy changes dropping the session cookie." },
    ],
    timeline: [
      { id: "t1", label: "Problem described", at: "Oct 5, 09:12", state: "done" },
      { id: "t2", label: "Evidence collected", detail: "5 items", at: "Oct 5, 09:40", state: "done" },
      { id: "t3", label: "Hypotheses formed", detail: "3 candidates", at: "Oct 5, 10:05", state: "done" },
      { id: "t4", label: "Root cause identified", at: "Oct 5, 11:30", state: "done" },
      { id: "t5", label: "Fix proposed", at: "Oct 5, 11:48", state: "active" },
      { id: "t6", label: "Tests & validation", at: "—", state: "upcoming" },
      { id: "t7", label: "Human review & PR", at: "—", state: "upcoming" },
    ],
    rootCause: {
      explanation:
        "rotateRefreshToken() revokes the presented token before the replacement is persisted. When the client issues two refresh calls in the same window, the second finds a revoked token and the session is invalidated.",
      confidence: "high",
      evidenceIds: ["e1", "e2", "e3", "e4"],
      files: ["src/auth/tokens.ts", "src/auth/middleware.ts"],
      commits: ["a91f3c2"],
    },
    fix: {
      file: "src/auth/tokens.ts",
      risk: "medium",
      changedLines: "+6 −3",
      explanation: "Persist the new token and revoke the old one in a single transaction, and allow a short reuse grace window for the previous token.",
      original: `export async function rotateRefreshToken(oldToken: string) {
  const record = await db.refreshTokens.find(oldToken);
  if (!record || record.revoked) throw new AuthError("invalid refresh token");

  await db.refreshTokens.revoke(oldToken);
  const next = await issueRefreshToken(record.userId);
  return next;
}
`,
      proposed: `export async function rotateRefreshToken(oldToken: string) {
  return db.transaction(async (tx) => {
    const record = await tx.refreshTokens.find(oldToken);
    if (!record || isRevokedBeyondGrace(record)) throw new AuthError("invalid refresh token");

    const next = await issueRefreshToken(record.userId, tx);
    await tx.refreshTokens.revoke(oldToken, { graceMs: 10_000 });
    return next;
  });
}
`,
    },
    tests: [
      { name: "concurrent refresh keeps session alive", file: "src/auth/tokens.spec.ts", state: "not-run" },
      { name: "revoked token rejected after grace window", file: "src/auth/tokens.spec.ts", state: "not-run" },
    ],
    validation: [
      { id: "v1", name: "Type Check", state: "passed", detail: "Ran on proposed diff" },
      { id: "v2", name: "Lint", state: "passed", detail: "Ran on proposed diff" },
      { id: "v3", name: "Tests", state: "not-run" },
      { id: "v4", name: "Security Scan", state: "pending" },
    ],
    review: { state: "not-started", note: "Review begins once tests have run." },
    pullRequest: { state: "none", note: "A pull request is only created after human approval." },
  },
  {
    id: "inv-1041",
    projectId: "payments-api",
    title: "Checkout totals off by one cent",
    problem: "Rounding mismatch between cart and invoice totals for some multi-item orders.",
    status: "investigating",
    severity: "medium",
    confidence: "medium",
    createdAt: "Oct 4, 2026",
    lastActivity: "2 hours ago",
    evidence: [
      { id: "e1", type: "file", title: "billing/round.ts", file: "src/billing/round.ts", lines: [3, 9], note: "Uses Math.round on floating cents." },
      { id: "e2", type: "test", title: "invoice.spec.ts", file: "src/billing/invoice.spec.ts", lines: [12, 20], note: "Fixture uses integers only." },
    ],
    hypotheses: [{ id: "h1", title: "Floating point accumulation", likelihood: "medium", supporting: 2, contradicting: 0, summary: "Totals summed as floats before rounding." }],
    timeline: [
      { id: "t1", label: "Problem described", at: "Oct 4, 14:02", state: "done" },
      { id: "t2", label: "Evidence collected", at: "Oct 4, 14:30", state: "active" },
      { id: "t3", label: "Hypotheses formed", at: "—", state: "upcoming" },
    ],
    tests: [],
    validation: noChecks(),
    review: { state: "not-started", note: "" },
    pullRequest: { state: "none", note: "" },
  },
  {
    id: "inv-1039",
    projectId: "web-dashboard",
    title: "Dashboard chart flickers on resize",
    problem: "Chart remounts on every resize event.",
    status: "closed",
    severity: "low",
    confidence: "high",
    createdAt: "Sep 30, 2026",
    lastActivity: "5 days ago",
    evidence: [{ id: "e1", type: "file", title: "Chart.tsx", file: "src/components/Chart.tsx", lines: [20, 31], note: "Key changes with width." }],
    hypotheses: [{ id: "h1", title: "Unstable React key", likelihood: "high", supporting: 1, contradicting: 0, summary: "Key derived from width." }],
    timeline: [{ id: "t1", label: "Problem described", at: "Sep 30", state: "done" }],
    tests: [],
    validation: [
      { id: "v1", name: "Type Check", state: "passed" },
      { id: "v2", name: "Lint", state: "passed" },
      { id: "v3", name: "Tests", state: "passed" },
      { id: "v4", name: "Security Scan", state: "passed" },
    ],
    review: { state: "approved", note: "Approved by reviewer." },
    pullRequest: { state: "open", note: "PR #212 open." },
  },
];

export const SAMPLE_ACTIVITY: ActivityItem[] = [
  { id: "a1", kind: "investigation-started", text: "Investigation started: Checkout totals off by one cent", at: "2 hours ago" },
  { id: "a2", kind: "validation-completed", text: "Validation completed for inv-1039", at: "5 days ago" },
  { id: "a3", kind: "pr-created", text: "Pull request #212 created for web-dashboard", at: "5 days ago" },
  { id: "a4", kind: "investigation-completed", text: "Investigation completed: Dashboard chart flickers", at: "5 days ago" },
  { id: "a5", kind: "indexed", text: "Repository indexed: acme/payments-api", at: "6 days ago" },
];

export const SAMPLE_PULL_REQUESTS: PullRequest[] = [
  { id: "pr-212", title: "fix: stabilize chart key on resize", projectId: "web-dashboard", branch: "fix/chart-key", status: "open", investigationId: "inv-1039", updatedAt: "5 days ago" },
  { id: "pr-198", title: "chore: bump auth deps", projectId: "auth-service", branch: "chore/deps", status: "merged", updatedAt: "2 weeks ago" },
];

export const SAMPLE_INCIDENTS: Incident[] = [
  { id: "inc-77", title: "Elevated 401 rate on /api/session", severity: "high", source: "Observability (placeholder)", status: "open", openedAt: "Today, 14:00" },
  { id: "inc-75", title: "Slow invoice generation", severity: "medium", source: "Observability (placeholder)", status: "monitoring", openedAt: "Yesterday" },
];
