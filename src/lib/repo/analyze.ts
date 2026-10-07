import type { DependencyInfo, IndexedFile, RepoAnalysis } from "./types";

/** Contents of manifest files, captured during ingestion (path → text). */
export type Manifests = Record<string, string>;
export const MANIFEST_RE = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|composer\.json|Gemfile)$/;

const FRAMEWORKS: [string, RegExp][] = [
  ["Next.js", /^next$/], ["React", /^react$/], ["Vue", /^vue$/], ["Nuxt", /^nuxt$/], ["Svelte", /^svelte$/], ["SvelteKit", /^@sveltejs\/kit$/],
  ["Angular", /^@angular\/core$/], ["Remix", /^@remix-run\//], ["Astro", /^astro$/], ["Express", /^express$/], ["Fastify", /^fastify$/], ["NestJS", /^@nestjs\/core$/],
  ["Hono", /^hono$/], ["Koa", /^koa$/], ["Tailwind CSS", /^tailwindcss$/], ["Vite", /^vite$/], ["Electron", /^electron$/], ["React Native", /^react-native$/], ["Expo", /^expo$/],
  ["Django", /^django$/i], ["Flask", /^flask$/i], ["FastAPI", /^fastapi$/i], ["Gin", /gin-gonic\/gin$/], ["Echo", /labstack\/echo/], ["Fiber", /gofiber\/fiber/], ["Spring Boot", /spring-boot/], ["Rails", /^rails$/], ["Laravel", /^laravel\/framework$/],
];
const AUTH: [string, RegExp][] = [
  ["NextAuth / Auth.js", /^(next-auth|@auth\/core)$/], ["Passport", /^passport/], ["JWT (jsonwebtoken)", /^jsonwebtoken$/], ["jose (JWT/JWE)", /^jose$/], ["bcrypt", /^bcrypt(js)?$/],
  ["Clerk", /^@clerk\//], ["Auth0", /auth0/], ["Firebase Auth", /^firebase(-admin)?$/], ["Supabase Auth", /^@supabase\//], ["Lucia", /^lucia$/], ["Better Auth", /^better-auth$/], ["Argon2", /^argon2$/],
  ["PyJWT", /^pyjwt$/i], ["Django auth", /^django$/i], ["Flask-Login", /^flask-login$/i], ["Spring Security", /spring-security/],
];
const DATABASE: [string, RegExp][] = [
  ["Prisma", /^(prisma|@prisma\/client)$/], ["Drizzle", /^drizzle-orm$/], ["Mongoose / MongoDB", /^(mongoose|mongodb)$/], ["TypeORM", /^typeorm$/], ["Sequelize", /^sequelize$/], ["Knex", /^knex$/], ["Kysely", /^kysely$/],
  ["PostgreSQL (pg)", /^(pg|postgres|@neondatabase\/)/], ["MySQL", /^mysql2?$/], ["SQLite", /^(better-sqlite3|sqlite3)$/], ["Redis", /^(redis|ioredis|@upstash\/redis)$/],
  ["SQLAlchemy", /^sqlalchemy$/i], ["psycopg", /^psycopg/i], ["GORM", /gorm\.io/], ["Diesel", /^diesel$/], ["Hibernate / JPA", /hibernate|spring-data-jpa/],
];
const SERVICES: [string, RegExp][] = [
  ["Stripe", /^stripe$|@stripe\//], ["AWS SDK", /^aws-sdk$|^@aws-sdk\/|^boto3$/], ["Google Cloud", /^@google-cloud\//], ["SendGrid", /sendgrid/], ["Resend", /^resend$/], ["Twilio", /^twilio$/], ["Sentry", /sentry/],
  ["Octokit / GitHub API", /^(octokit|@octokit\/)/], ["OpenAI", /^openai$/], ["Anthropic", /^@anthropic-ai\//], ["Slack", /^@slack\//], ["Vercel", /^@vercel\//], ["Cloudinary", /cloudinary/], ["Algolia", /algolia/], ["Firebase", /^firebase(-admin)?$/], ["Supabase", /^@supabase\//], ["Posthog", /posthog/], ["Datadog", /datadog|dd-trace/],
];
const TEST_FW: [string, RegExp][] = [["Jest", /^jest$/], ["Vitest", /^vitest$/], ["Mocha", /^mocha$/], ["Playwright", /playwright/], ["Cypress", /^cypress$/], ["Testing Library", /@testing-library\//], ["pytest", /^pytest$/i], ["unittest", /^unittest/], ["JUnit", /junit/]];

const AUTH_PATH = /(^|\/)(auth|login|logout|signin|signup|sign-in|sign-up|session|sessions|jwt|oauth|password|middleware)(\/|\.|-|_|$)/i;
const DB_PATH = /(^|\/)(prisma|db|database|models?|migrations?|schema|repositories|repository|dao|entities)(\/|\.|$)/i;

function parseDeps(manifests: Manifests): { deps: DependencyInfo[]; managers: Set<string> } {
  const deps: DependencyInfo[] = [];
  const managers = new Set<string>();
  for (const [path, text] of Object.entries(manifests)) {
    const name = path.split("/").pop()!;
    try {
      if (name === "package.json") {
        const j = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; packageManager?: string };
        for (const [n, v] of Object.entries(j.dependencies ?? {})) deps.push({ name: n, version: v, dev: false });
        for (const [n, v] of Object.entries(j.devDependencies ?? {})) deps.push({ name: n, version: v, dev: true });
        if (j.packageManager) managers.add(j.packageManager.split("@")[0]!);
      } else if (name.startsWith("requirements")) {
        for (const line of text.split("\n")) {
          const m = line.trim().match(/^([A-Za-z0-9_.\-]+)\s*(?:[=<>~!]=?\s*([\w.*]+))?/);
          if (m && !line.trim().startsWith("#") && !line.trim().startsWith("-")) deps.push({ name: m[1]!, version: m[2] ?? "*", dev: false });
        }
        managers.add("pip");
      } else if (name === "pyproject.toml") {
        for (const m of text.matchAll(/^\s*"?([A-Za-z0-9_.\-]+)"?\s*(?:=\s*"([^"]+)"|[<>=~!])/gm)) if (!["name", "version", "python", "description", "requires-python"].includes(m[1]!)) deps.push({ name: m[1]!, version: m[2] ?? "*", dev: false });
        managers.add(text.includes("[tool.poetry") ? "poetry" : "pip");
      } else if (name === "go.mod") {
        for (const m of text.matchAll(/^\s*(?:require\s+)?([\w.\-]+\.[\w.\-/]+)\s+(v[\w.\-+]+)/gm)) deps.push({ name: m[1]!, version: m[2]!, dev: false });
        managers.add("go modules");
      } else if (name === "Cargo.toml") {
        const sec = text.split(/^\[dependencies\]/m)[1]?.split(/^\[/m)[0] ?? "";
        for (const m of sec.matchAll(/^([\w\-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/gm)) deps.push({ name: m[1]!, version: m[2] ?? m[3] ?? "*", dev: false });
        managers.add("cargo");
      } else if (name === "pom.xml") {
        for (const m of text.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) deps.push({ name: m[1]!, version: "*", dev: false });
        managers.add("maven");
      } else if (name === "build.gradle") managers.add("gradle");
      else if (name === "composer.json") {
        const j = JSON.parse(text) as { require?: Record<string, string> };
        for (const [n, v] of Object.entries(j.require ?? {})) deps.push({ name: n, version: v, dev: false });
        managers.add("composer");
      } else if (name === "Gemfile") {
        for (const m of text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)) deps.push({ name: m[1]!, version: "*", dev: false });
        managers.add("bundler");
      }
    } catch { /* malformed manifest: skip, never fail indexing */ }
  }
  return { deps, managers };
}

const match = (table: [string, RegExp][], names: string[]) => table.filter(([, re]) => names.some((n) => re.test(n))).map(([label]) => label);

export function analyzeRepository(files: IndexedFile[], manifests: Manifests, allPaths: string[]): RepoAnalysis {
  const { deps, managers } = parseDeps(manifests);
  const names = deps.map((d) => d.name);
  const paths = new Set(allPaths);
  const has = (p: string) => paths.has(p) || allPaths.some((x) => x.endsWith(`/${p}`));

  if (has("package-lock.json")) managers.add("npm");
  if (has("yarn.lock")) managers.add("yarn");
  if (has("pnpm-lock.yaml")) managers.add("pnpm");
  if (has("bun.lockb") || has("bun.lock")) managers.add("bun");
  if (has("Pipfile") || has("Pipfile.lock")) managers.add("pipenv");
  if (has("poetry.lock")) managers.add("poetry");
  if (managers.has("npm") && !has("package-lock.json") && !has("yarn.lock") && !has("pnpm-lock.yaml") && Object.keys(manifests).some((m) => m.endsWith("package.json")) && managers.size === 1) managers.add("npm");
  if (!managers.size && Object.keys(manifests).some((m) => m.endsWith("package.json"))) managers.add("npm");

  // Languages by lines of source.
  const byLang = new Map<string, { files: number; lines: number }>();
  for (const f of files) {
    if (f.category !== "source") continue;
    const e = byLang.get(f.language) ?? { files: 0, lines: 0 };
    e.files++; e.lines += f.lineCount;
    byLang.set(f.language, e);
  }
  const languages = [...byLang.entries()].map(([language, v]) => ({ language, ...v })).sort((a, b) => b.lines - a.lines);

  const frameworks = match(FRAMEWORKS, names);
  const authLibs = match(AUTH, names);
  const dbLibs = match(DATABASE, names);
  const services = match(SERVICES, names);
  if (files.some((f) => f.path.endsWith("schema.prisma")) && !dbLibs.includes("Prisma")) dbLibs.push("Prisma");

  // Auth: libraries + files.
  const authFiles = files.filter((f) => f.category !== "docs" && AUTH_PATH.test(f.path)).map((f) => f.path);
  const authentication = [...authLibs, ...(authFiles.length ? [`${authFiles.length} auth-related files (e.g. ${authFiles.slice(0, 3).join(", ")})`] : [])];

  // Database: libraries + layer files.
  const dbFiles = files.filter((f) => f.category === "source" && DB_PATH.test(f.path)).map((f) => f.path);
  const database = [...dbLibs, ...(dbFiles.length ? [`${dbFiles.length} data-layer files (e.g. ${dbFiles.slice(0, 3).join(", ")})`] : [])];

  // API routes.
  const apiRoutes: RepoAnalysis["apiRoutes"] = [];
  for (const f of files) {
    const app = f.path.match(/(?:^|\/)app\/(.*)\/route\.[tj]sx?$/) ?? f.path.match(/(?:^|\/)app\/route\.[tj]sx?$/);
    if (app) {
      const methods = f.symbols.filter((s) => s.kind === "route").map((s) => s.name);
      apiRoutes.push({ path: "/" + (app[1] ?? "").replace(/\([^)]*\)\/?/g, "").replace(/\/$/, ""), file: f.path, methods });
      continue;
    }
    const pages = f.path.match(/(?:^|\/)pages\/(api\/.*)\.[tj]sx?$/);
    if (pages) { apiRoutes.push({ path: "/" + pages[1]!.replace(/\/index$/, ""), file: f.path, methods: [] }); continue; }
    for (const s of f.symbols) if (s.kind === "route" && s.meta?.path) apiRoutes.push({ path: s.meta.path, file: f.path, methods: [s.meta.method ?? ""] });
  }

  // Entry points.
  const entryRe = /(^|\/)(src\/)?(index|main|server|app|cli)\.[a-z]+$|(^|\/)app\/(layout|page)\.[tj]sx?$|(^|\/)pages\/_app\.[tj]sx?$|(^|\/)manage\.py$|(^|\/)main\.go$|(^|\/)src\/main\.rs$/;
  const entryPoints = files.filter((f) => f.category === "source" && entryRe.test(f.path)).map((f) => f.path).slice(0, 12);

  // Tests.
  const testFiles = files.filter((f) => f.isTest);
  const tests = { files: testFiles.length, frameworks: match(TEST_FW, names) };

  // Configuration.
  const configuration = files.filter((f) => f.category === "config").map((f) => f.path).slice(0, 30);

  // Important directories: top-level + second-level source dirs by file count with a role guess.
  const dirCount = new Map<string, number>();
  for (const f of files) {
    const parts = f.path.split("/");
    if (parts.length < 2) continue;
    for (let depth = 1; depth <= Math.min(2, parts.length - 1); depth++) {
      const d = parts.slice(0, depth).join("/");
      dirCount.set(d, (dirCount.get(d) ?? 0) + 1);
    }
  }
  const role = (d: string) => {
    const n = d.split("/").pop()!.toLowerCase();
    if (/^(api|routes?|controllers?|handlers?)$/.test(n)) return "API / routing";
    if (/^(auth|authentication|security)$/.test(n)) return "Authentication";
    if (/^(components?|ui|views?|pages?|app|screens?)$/.test(n)) return "UI";
    if (/^(models?|entities|schema|prisma|db|database|migrations?|repositories)$/.test(n)) return "Data layer";
    if (/^(lib|utils?|helpers?|common|shared|core)$/.test(n)) return "Shared code";
    if (/^(services?|domain|usecases?)$/.test(n)) return "Business logic";
    if (/^(tests?|__tests__|spec|e2e)$/.test(n)) return "Tests";
    if (/^(docs?)$/.test(n)) return "Documentation";
    if (/^(config|configs?|scripts?|\.github)$/.test(n)) return "Configuration / tooling";
    if (/^(src|packages|apps)$/.test(n)) return "Source root";
    return null;
  };
  const importantDirectories = [...dirCount.entries()].map(([path, n]) => ({ path, role: role(path), n })).filter((d): d is { path: string; role: string; n: number } => !!d.role).sort((a, b) => b.n - a.n).slice(0, 14).map(({ path, role: r }) => ({ path, role: r }));

  return { languages, frameworks, packageManagers: [...managers], dependencies: deps, importantDirectories, entryPoints, apiRoutes: apiRoutes.slice(0, 200), authentication, database, tests, configuration, externalServices: services };
}
