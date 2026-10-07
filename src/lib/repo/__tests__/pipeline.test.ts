import { describe, expect, it } from "vitest";
import { buildIndex } from "../pipeline";
import { findEvidence } from "../evidence";
import { memoryReader } from "../memory";
import { parseFile } from "../parse";
import { createPathFilter } from "../filter";
import { parseQuery } from "../query";
import { resolveImport } from "../graph";
import type { FileSource } from "../types";

function fakeSource(files: Record<string, string>): FileSource {
  return {
    commitSha: "abc1234",
    branch: "main",
    async *files() {
      for (const [path, c] of Object.entries(files)) yield { path, size: Buffer.byteLength(c), read: async () => c };
    },
  };
}

describe("filter", () => {
  const f = createPathFilter("secret-dir/\n*.log");
  it("skips generated/vendored/binary/secret content", () => {
    expect(f.check("node_modules/x/index.js", 10)).toBe("ignored-dir");
    expect(f.check(".next/server/a.js", 10)).toBe("ignored-dir");
    expect(f.check("logo.png", 10)).toBe("binary");
    expect(f.check(".env.local", 10)).toBe("secret");
    expect(f.check(".env.example", 10)).toBeNull();
    expect(f.check("package-lock.json", 10)).toBe("lockfile");
    expect(f.check("big.ts", 10_000_000)).toBe("too-large");
    expect(f.check("secret-dir/a.ts", 10)).toBe("gitignore");
    expect(f.check("src/a.ts", 10)).toBeNull();
  });
});

describe("parse", () => {
  it("extracts TS symbols, imports and routes with line ranges", () => {
    const src = [
      'import { db } from "@/lib/db";',
      'import jwt from "jsonwebtoken";',
      "export interface User { id: string }",
      "export type Id = string;",
      "export class AuthService {",
      "  login(u: string) { return u; }",
      "}",
      "export async function validateToken(t: string) {",
      '  return jwt.verify(t, "x");',
      "}",
      "export const LoginForm = () => <form />;",
      "const app = express();",
      'app.post("/api/login", handler);',
      "",
    ].join("\n");
    const p = parseFile("src/auth/service.tsx", src);
    const by = Object.fromEntries(p.symbols.map((s) => [s.name, s]));
    expect(by.User.kind).toBe("interface");
    expect(by.Id.kind).toBe("type");
    expect(by.AuthService.kind).toBe("class");
    expect(by.login.parent).toBe("AuthService");
    expect(by.validateToken).toMatchObject({ kind: "function", exported: true, lineStart: 8, lineEnd: 10 });
    expect(by.LoginForm.kind).toBe("component");
    expect(by["POST /api/login"].kind).toBe("route");
    expect(p.imports).toEqual(expect.arrayContaining(["@/lib/db", "jsonwebtoken"]));
  });

  it("detects Next route handlers and python/go declarations", () => {
    const r = parseFile("src/app/api/x/route.ts", "export async function GET() { return 1 }\nexport async function POST() { return 2 }");
    expect(r.symbols.map((s) => s.kind)).toEqual(["route", "route"]);
    const py = parseFile("a.py", "import os\nclass A:\n    def run(self):\n        pass\n\ndef main():\n    pass\n");
    expect(py.symbols.map((s) => s.name)).toEqual(["A", "run", "main"]);
    expect(py.symbols[0]).toMatchObject({ lineStart: 2, lineEnd: 4 });
    const go = parseFile("a.go", 'package a\nimport "fmt"\nfunc Hello() {\n}\ntype S struct {\n}\n');
    expect(go.symbols.map((s) => s.name)).toEqual(["Hello", "S"]);
  });

  it("survives syntax errors", () => {
    expect(() => parseFile("bad.ts", "function ( {{{")).not.toThrow();
  });
});

describe("graph & query", () => {
  it("resolves relative and alias imports", () => {
    const paths = new Set(["src/a/b.ts", "src/lib/x/index.ts"]);
    expect(resolveImport("src/a/c.ts", "./b", paths)).toBe("src/a/b.ts");
    expect(resolveImport("src/a/c.ts", "@/lib/x", paths)).toBe("src/lib/x/index.ts");
    expect(resolveImport("src/a/c.ts", "react", paths)).toBeNull();
  });

  it("expands concepts with lower weight than typed words", () => {
    const q = parseQuery("Find everything related to authentication");
    const t = Object.fromEntries(q.terms.map((x) => [x.term, x]));
    expect(t.authentication.weight).toBe(1);
    expect(t.login.origin).toBe("concept");
    expect(t.login.weight).toBeLessThan(1);
    expect(t.everything).toBeUndefined();
  });
});

describe("evidence engine (synthetic repo)", () => {
  it("ranks auth code above unrelated code and links tests, commits and deps", async () => {
    const files = {
      "package.json": JSON.stringify({ dependencies: { jsonwebtoken: "9", express: "4", lodash: "4" } }),
      "src/auth/middleware.ts": 'import jwt from "jsonwebtoken";\nexport function validateToken(req) {\n  return jwt.verify(req.token, secret);\n}\n',
      "src/auth/middleware.test.ts": 'import { validateToken } from "./middleware";\ntest("validateToken", () => {});\n',
      "src/pages/login.tsx": "export default function LoginPage() { return <form>login</form>; }\n",
      "src/models/user.ts": "export interface User { id: string; password: string }\n",
      "src/utils/format.ts": "export const formatDate = (d) => d.toISOString();\n",
      ".env": "SECRET=shh",
    };
    const index = await buildIndex(fakeSource(files));
    expect(index.files.map((f) => f.path)).not.toContain(".env");
    expect(index.stats.skippedReasons.secret).toBe(1);
    const commits = [
      { sha: "deadbeef1234", message: "fix(auth): token refresh", authorName: "a", authoredAt: new Date(), files: ["src/auth/middleware.ts"] },
      { sha: "cafe0000aaaa", message: "chore: formatting", authorName: "a", authoredAt: new Date(), files: ["src/utils/format.ts"] },
    ];
    const { evidence } = await findEvidence(memoryReader(index, commits), "authentication");
    const paths = evidence.map((e) => e.filePath).filter(Boolean);
    expect(paths).toContain("src/auth/middleware.ts");
    expect(paths).toContain("src/pages/login.tsx");
    expect(paths).toContain("src/models/user.ts");
    expect(evidence.some((e) => e.kind === "TEST" && e.filePath === "src/auth/middleware.test.ts")).toBe(true);
    expect(evidence.some((e) => e.kind === "DEPENDENCY" && e.dependency === "jsonwebtoken")).toBe(true);
    expect(evidence.some((e) => e.kind === "COMMIT" && e.commitSha === "deadbeef1234")).toBe(true);
    expect(evidence.find((e) => e.filePath === "src/utils/format.ts" && e.kind === "FILE")).toBeUndefined();
    expect(evidence.find((e) => e.kind === "COMMIT" && e.commitSha === "cafe0000aaaa")).toBeUndefined();
    for (const e of evidence) expect(e.reasons.length).toBeGreaterThan(0);
  });

  it("returns nothing (never invents) for a query with no matches", async () => {
    const index = await buildIndex(fakeSource({ "a.ts": "export const x = 1;\n" }));
    const { evidence } = await findEvidence(memoryReader(index), "zzzqqq kubernetes");
    expect(evidence).toEqual([]);
  });
});
