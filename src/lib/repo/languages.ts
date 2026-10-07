import type { FileCategory } from "./types";

const EXT: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP", cs: "C#", swift: "Swift",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", dart: "Dart", scala: "Scala", sh: "Shell", bash: "Shell",
  sql: "SQL", prisma: "Prisma", graphql: "GraphQL", gql: "GraphQL", proto: "Protobuf",
  html: "HTML", css: "CSS", scss: "SCSS", sass: "SCSS", less: "Less", vue: "Vue", svelte: "Svelte",
  md: "Markdown", mdx: "Markdown", json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML", xml: "XML", ini: "INI", env: "Env", txt: "Text",
};

export const extOf = (path: string) => {
  const name = path.split("/").pop()!;
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
};

export function detectLanguage(path: string): string {
  const name = path.split("/").pop()!;
  if (name === "Dockerfile" || name.startsWith("Dockerfile.")) return "Dockerfile";
  if (name === "Makefile") return "Makefile";
  return EXT[extOf(path)] ?? "Text";
}

/** Monaco language id for a path. */
export function monacoLanguage(path: string): string {
  const l = detectLanguage(path);
  const map: Record<string, string> = { TypeScript: "typescript", JavaScript: "javascript", Python: "python", Go: "go", Rust: "rust", Java: "java", Kotlin: "kotlin", Ruby: "ruby", PHP: "php", "C#": "csharp", Swift: "swift", C: "c", "C++": "cpp", Shell: "shell", SQL: "sql", GraphQL: "graphql", HTML: "html", CSS: "css", SCSS: "scss", Less: "less", Markdown: "markdown", JSON: "json", YAML: "yaml", XML: "xml", Dockerfile: "dockerfile", Vue: "html", Svelte: "html", TOML: "ini", INI: "ini" };
  return map[l] ?? "plaintext";
}

const TEST_PATH = /(^|\/)(__tests__|tests?|spec|e2e|cypress|playwright)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
export const isTestPath = (p: string) => TEST_PATH.test(p);

const CONFIG_NAMES = /(^|\/)(package\.json|tsconfig[^/]*\.json|next\.config\.[a-z]+|vite\.config\.[a-z]+|webpack\.config\.[a-z]+|tailwind\.config\.[a-z]+|postcss\.config\.[a-z]+|\.eslintrc[^/]*|eslint\.config\.[a-z]+|\.prettierrc[^/]*|babel\.config\.[a-z]+|jest\.config\.[a-z]+|vitest\.config\.[a-z]+|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.github\/workflows\/[^/]+|vercel\.json|netlify\.toml|Makefile|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|\.env\.(example|sample|template)|prisma\.config\.[a-z]+|\.gitignore|\.dockerignore)$/i;

export function categorize(path: string, language: string): FileCategory {
  if (isTestPath(path)) return "test";
  if (CONFIG_NAMES.test(path)) return "config";
  if (language === "Markdown" || /(^|\/)docs?\//i.test(path) || /(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE)/i.test(path)) return "docs";
  if (["CSS", "SCSS", "Less"].includes(language)) return "style";
  if (["JSON", "YAML", "TOML", "XML", "INI", "Env", "Text"].includes(language)) return "data";
  if (language === "Prisma" || language === "SQL") return "source";
  if (Object.values(EXT).includes(language)) return "source";
  return "other";
}
