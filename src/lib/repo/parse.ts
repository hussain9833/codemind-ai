import ts from "typescript";
import { detectLanguage, extOf } from "./languages";
import type { ExtractedSymbol, ParsedFile, SymbolKind } from "./types";

const HTTP = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const ROUTER_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all", "use"]);
const JS_LIKE = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"]);

const firstLine = (text: string) => text.split("\n", 1)[0]!.trim().slice(0, 200);

/** Syntax-aware parse for TS/JS (real AST); lightweight declaration scanners for other languages. */
export function parseFile(path: string, content: string): ParsedFile {
  const language = detectLanguage(path);
  const lineCount = content.split("\n").length;
  const ext = extOf(path);
  if (JS_LIKE.has(ext)) return { language, ...parseTsJs(path, content, ext), lineCount };
  const scanned = scanOther(language, content);
  return { language, ...scanned, lineCount };
}

// ───────────── TypeScript / JavaScript via the TS compiler API ─────────────

function parseTsJs(path: string, content: string, ext: string): Pick<ParsedFile, "symbols" | "imports" | "exports"> {
  const kind = ext === "tsx" ? ts.ScriptKind.TSX : ext === "jsx" ? ts.ScriptKind.JSX : ext === "js" || ext === "mjs" || ext === "cjs" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind);
  const symbols: ExtractedSymbol[] = [];
  const imports = new Set<string>();
  const exportsSet = new Set<string>();
  const isRouteFile = /(^|\/)route\.[tj]sx?$/.test(path);

  const lines = (n: ts.Node) => ({
    lineStart: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
    lineEnd: sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1,
  });
  const hasExport = (n: ts.Node) => !!(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
  const hasDefault = (n: ts.Node) => !!(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
  const sig = (n: ts.Node) => firstLine(n.getText(sf));
  const containsJsx = (n: ts.Node): boolean => {
    let found = false;
    const visit = (c: ts.Node) => {
      if (found) return;
      if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c)) { found = true; return; }
      ts.forEachChild(c, visit);
    };
    visit(n);
    return found;
  };

  const push = (name: string, k: SymbolKind, node: ts.Node, exported: boolean, extra?: Partial<ExtractedSymbol>) => {
    symbols.push({ name, kind: k, exported, signature: sig(node), ...lines(node), ...extra });
    if (exported) exportsSet.add(name);
  };

  const classify = (name: string, node: ts.Node): SymbolKind => {
    if (isRouteFile && HTTP.has(name)) return "route";
    if (/^[A-Z]/.test(name) && (ext === "tsx" || ext === "jsx" || containsJsx(node))) return "component";
    return "function";
  };

  const visitTop = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
    else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
      if (node.exportClause && ts.isNamedExports(node.exportClause)) node.exportClause.elements.forEach((e) => exportsSet.add(e.name.text));
    } else if (ts.isExportAssignment(node)) exportsSet.add("default");
    else if (ts.isFunctionDeclaration(node)) {
      const name = node.name?.text ?? (hasDefault(node) ? "default" : null);
      if (name) { push(name, classify(name, node), node, hasExport(node), name === "default" ? {} : undefined); if (hasDefault(node)) exportsSet.add("default"); }
    } else if (ts.isClassDeclaration(node)) {
      const name = node.name?.text ?? (hasDefault(node) ? "default" : null);
      if (name) {
        push(name, "class", node, hasExport(node));
        for (const m of node.members) {
          if ((ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m)) ) {
            const mn = ts.isConstructorDeclaration(m) ? "constructor" : m.name.getText(sf);
            symbols.push({ name: mn, kind: "method", parent: name, exported: false, signature: sig(m), ...lines(m) });
          }
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) push(node.name.text, "interface", node, hasExport(node));
    else if (ts.isTypeAliasDeclaration(node)) push(node.name.text, "type", node, hasExport(node));
    else if (ts.isEnumDeclaration(node)) push(node.name.text, "enum", node, hasExport(node));
    else if (ts.isVariableStatement(node)) {
      const exported = hasExport(node);
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const name = d.name.text;
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) push(name, classify(name, init), node, exported);
        else if (init && ts.isCallExpression(init) && /^[A-Z]/.test(name) && containsJsx(init)) push(name, "component", node, exported); // memo(forwardRef(...))
        else if (exported) push(name, "variable", node, true);
      }
    } else if (ts.isExpressionStatement(node)) detectRoute(node.expression);
  };

  /** Express/Fastify/Hono style: app.get("/path", handler) */
  const detectRoute = (expr: ts.Expression) => {
    if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) return;
    const method = expr.expression.name.text;
    const target = expr.expression.expression.getText(sf);
    const first = expr.arguments[0];
    if (!ROUTER_METHODS.has(method) || !/^(app|router|server|api|route[rs]?|fastify)$/i.test(target.split(".").pop()!) || !first || !ts.isStringLiteralLike(first)) return;
    if (method === "use" && !first.text.startsWith("/")) return;
    symbols.push({ name: `${method.toUpperCase()} ${first.text}`, kind: "route", exported: false, signature: firstLine(expr.getText(sf)), ...lines(expr), meta: { method: method.toUpperCase(), path: first.text } });
  };

  sf.statements.forEach(visitTop);

  // require() and dynamic import() anywhere in the file.
  const scan = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteralLike(arg) && ((ts.isIdentifier(callee) && callee.text === "require") || callee.kind === ts.SyntaxKind.ImportKeyword)) imports.add(arg.text);
    }
    ts.forEachChild(n, scan);
  };
  scan(sf);

  return { symbols, imports: [...imports], exports: [...exportsSet] };
}

// ───────────── Other languages: declaration scanners ─────────────

interface Pattern { re: RegExp; kind: SymbolKind; name: number; exported?: (m: RegExpMatchArray) => boolean }

const PY: Pattern[] = [
  { re: /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/, kind: "function", name: 2, exported: (m) => !m[2]!.startsWith("_") },
  { re: /^(\s*)class\s+([A-Za-z_]\w*)/, kind: "class", name: 2, exported: (m) => !m[2]!.startsWith("_") },
];
const GO: Pattern[] = [
  { re: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[(\[]/, kind: "function", name: 1, exported: (m) => /^[A-Z]/.test(m[1]!) },
  { re: /^type\s+([A-Za-z_]\w*)\s+struct/, kind: "class", name: 1, exported: (m) => /^[A-Z]/.test(m[1]!) },
  { re: /^type\s+([A-Za-z_]\w*)\s+interface/, kind: "interface", name: 1, exported: (m) => /^[A-Z]/.test(m[1]!) },
];
const RUST: Pattern[] = [
  { re: /^\s*(pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, kind: "function", name: 2, exported: (m) => !!m[1] },
  { re: /^\s*(pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)/, kind: "class", name: 2, exported: (m) => !!m[1] },
  { re: /^\s*(pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_]\w*)/, kind: "interface", name: 2, exported: (m) => !!m[1] },
  { re: /^\s*(pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)/, kind: "enum", name: 2, exported: (m) => !!m[1] },
];
const JAVA: Pattern[] = [
  { re: /^\s*(?:public|protected|private)?\s*(?:abstract\s+|final\s+|static\s+)*(?:class|record)\s+([A-Za-z_]\w*)/, kind: "class", name: 1, exported: () => true },
  { re: /^\s*(?:public|protected|private)?\s*interface\s+([A-Za-z_]\w*)/, kind: "interface", name: 1, exported: () => true },
  { re: /^\s*(?:public|protected|private)\s+(?:static\s+)?(?:final\s+)?[\w<>\[\],.? ]+\s+([a-z_]\w*)\s*\([^;]*\)\s*(?:throws [\w, .]+)?\s*\{/, kind: "method", name: 1, exported: () => true },
];
const RUBY: Pattern[] = [
  { re: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!]?)/, kind: "function", name: 1 },
  { re: /^\s*class\s+([A-Z]\w*)/, kind: "class", name: 1, exported: () => true },
  { re: /^\s*module\s+([A-Z]\w*)/, kind: "class", name: 1, exported: () => true },
];
const PHP: Pattern[] = [
  { re: /^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/, kind: "class", name: 1, exported: () => true },
  { re: /^\s*(?:public|protected|private)?\s*(?:static\s+)?function\s+([A-Za-z_]\w*)/, kind: "function", name: 1 },
];

const PATTERNS: Record<string, Pattern[]> = { Python: PY, Go: GO, Rust: RUST, Java: JAVA, Kotlin: JAVA, "C#": JAVA, Ruby: RUBY, PHP: PHP };

const IMPORT_RES: Record<string, RegExp[]> = {
  Python: [/^\s*import\s+([\w.]+)/, /^\s*from\s+([\w.]+)\s+import/],
  Go: [/^\s*import\s+"([^"]+)"/, /^\s*"([^"]+)"\s*$/],
  Rust: [/^\s*use\s+([\w:]+)/],
  Java: [/^\s*import\s+(?:static\s+)?([\w.]+)/],
  Kotlin: [/^\s*import\s+([\w.]+)/],
  "C#": [/^\s*using\s+([\w.]+)\s*;/],
  Ruby: [/^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/],
  PHP: [/^\s*use\s+([\w\\]+)/],
};

function scanOther(language: string, content: string): Pick<ParsedFile, "symbols" | "imports" | "exports"> {
  const patterns = PATTERNS[language];
  const importRes = IMPORT_RES[language] ?? [];
  if (!patterns && !importRes.length) return { symbols: [], imports: [], exports: [] };
  const lines = content.split("\n");
  const symbols: ExtractedSymbol[] = [];
  const imports = new Set<string>();
  const indentOf = (l: string) => l.length - l.trimStart().length;

  lines.forEach((line, i) => {
    for (const re of importRes) { const m = line.match(re); if (m) imports.add(m[1]!); }
    for (const p of patterns ?? []) {
      const m = line.match(p.re);
      if (!m) continue;
      const name = m[p.name]!;
      // End line: Python by indentation; brace languages by brace matching.
      const end = language === "Python" || language === "Ruby" ? endByIndent(lines, i, indentOf(line)) : endByBraces(lines, i);
      const exported = p.exported ? p.exported(m) : false;
      symbols.push({ name, kind: p.kind, exported, signature: line.trim().slice(0, 200), lineStart: i + 1, lineEnd: end + 1 });
      break;
    }
  });
  return { symbols, imports: [...imports], exports: symbols.filter((s) => s.exported).map((s) => s.name) };
}

function endByIndent(lines: string[], start: number, indent: number): number {
  let end = start;
  for (let j = start + 1; j < lines.length; j++) {
    const l = lines[j]!;
    if (!l.trim()) continue;
    if (l.length - l.trimStart().length <= indent) break;
    end = j;
  }
  return end;
}

function endByBraces(lines: string[], start: number): number {
  let depth = 0;
  let seen = false;
  for (let j = start; j < Math.min(lines.length, start + 2000); j++) {
    for (const ch of lines[j]!) {
      if (ch === "{") { depth++; seen = true; }
      else if (ch === "}") depth--;
    }
    if (seen && depth <= 0) return j;
    if (!seen && j > start + 3) break; // single-line declaration without braces
  }
  return start;
}
