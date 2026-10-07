import type { IndexedFile } from "./types";

const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".json"];

/** Resolve an import specifier to a repo file path, or null for external packages. */
export function resolveImport(from: string, spec: string, paths: Set<string>): string | null {
  let base: string | null = null;
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const parts = from.split("/").slice(0, -1);
    for (const seg of spec.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop(); else parts.push(seg);
    }
    base = parts.join("/");
  } else if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith("~/")) base = `src/${spec.slice(2)}`;
  if (base === null) return null;
  for (const e of EXTS) if (paths.has(base + e)) return base + e;
  for (const e of EXTS.slice(1)) if (paths.has(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}

export interface ImportGraph {
  /** file → files it imports (internal only) */
  imports: Map<string, string[]>;
  /** file → files that import it */
  importedBy: Map<string, string[]>;
  /** external package → files importing it */
  packageUsers: Map<string, string[]>;
}

export const packageName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);

export function buildImportGraph(files: IndexedFile[]): ImportGraph {
  const paths = new Set(files.map((f) => f.path));
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  const packageUsers = new Map<string, string[]>();
  for (const f of files) {
    const internal: string[] = [];
    for (const spec of f.imports) {
      const target = resolveImport(f.path, spec, paths);
      if (target) {
        internal.push(target);
        (importedBy.get(target) ?? importedBy.set(target, []).get(target)!).push(f.path);
      } else if (!spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("node:")) {
        const pkg = packageName(spec);
        (packageUsers.get(pkg) ?? packageUsers.set(pkg, []).get(pkg)!).push(f.path);
      }
    }
    imports.set(f.path, internal);
  }
  return { imports, importedBy, packageUsers };
}
