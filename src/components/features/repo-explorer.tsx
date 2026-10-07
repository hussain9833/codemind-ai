"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Copy, File, FileCode2, FileJson, FileText, Folder, FolderOpen, GitCommit, Hash, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { defineCodeMindThemes, EDITOR_FONT, monacoThemeName, useAppTheme } from "@/components/ui/code-theme";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { TextInput } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@/lib/repo/types";
import type { editor } from "monaco-editor";
import { EvidenceResultCard } from "./evidence";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <Skeleton className="m-4 h-64" /> });

interface TreeFile { path: string; language: string; category: string; size: number; lineCount: number }
interface Node { name: string; path: string; type: "dir" | "file"; children: Node[] }
interface FileData {
  path: string; content: string; language: string; commitSha: string;
  meta: { size: number; lines: number; category: string; imports: string[]; exports: string[] };
  symbols: { name: string; kind: string; parent: string | null; lineStart: number; lineEnd: number; exported: boolean }[];
  commits: { sha: string; message: string; authorName: string; authoredAt: string }[];
}
type Mode = "evidence" | "files" | "symbols" | "code" | "dependencies" | "git";
const MODES: { id: Mode; label: string }[] = [
  { id: "evidence", label: "Evidence" }, { id: "files", label: "Files" }, { id: "symbols", label: "Symbols" }, { id: "code", label: "Code" }, { id: "dependencies", label: "Deps" }, { id: "git", label: "Git" },
];

function buildTree(files: TreeFile[]): Node[] {
  const root: Node = { name: "", path: "", type: "dir", children: [] };
  for (const f of files) {
    let cur = root;
    const parts = f.path.split("/");
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.path === path);
      if (!next) { next = { name: part, path, type: i === parts.length - 1 ? "file" : "dir", children: [] }; cur.children.push(next); }
      cur = next;
    });
  }
  const sort = (n: Node) => { n.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1)); n.children.forEach(sort); };
  sort(root);
  return root.children;
}
const parentsOf = (p: string) => p.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/"));

/** File icon + colour by extension (presentation only). */
function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (["ts", "tsx"].includes(ext)) return <FileCode2 className={cn("size-4 text-info", className)} />;
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return <FileCode2 className={cn("size-4 text-warning", className)} />;
  if (["json", "yml", "yaml", "toml"].includes(ext)) return <FileJson className={cn("size-4 text-purple", className)} />;
  if (["md", "mdx", "txt"].includes(ext)) return <FileText className={cn("size-4 text-subtle", className)} />;
  if (["py", "go", "rs", "java", "rb", "php"].includes(ext)) return <FileCode2 className={cn("size-4 text-success", className)} />;
  return <File className={cn("size-4 text-subtle", className)} />;
}

function TreeNode({ node, depth, open, toggle, active, onOpen }: { node: Node; depth: number; open: Set<string>; toggle: (p: string) => void; active?: string; onOpen: (p: string) => void }) {
  const isOpen = open.has(node.path);
  if (node.type === "dir") {
    return (
      <li>
        <button onClick={() => toggle(node.path)} aria-expanded={isOpen} style={{ paddingLeft: 10 + depth * 14 }} className="flex h-8 w-full items-center gap-1.5 pr-2 text-left text-sm text-muted transition-colors hover:bg-surface-3 hover:text-fg">
          {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-subtle" /> : <ChevronRight className="size-3.5 shrink-0 text-subtle" />}
          {isOpen ? <FolderOpen className="size-4 shrink-0 text-accent" /> : <Folder className="size-4 shrink-0 text-accent/80" />}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && <ul role="group">{node.children.map((c) => <TreeNode key={c.path} node={c} depth={depth + 1} open={open} toggle={toggle} active={active} onOpen={onOpen} />)}</ul>}
      </li>
    );
  }
  return (
    <li>
      <button onClick={() => onOpen(node.path)} aria-current={active === node.path} style={{ paddingLeft: 10 + depth * 14 + 20 }} className={cn("relative flex h-8 w-full items-center gap-2 pr-2 text-left text-sm transition-colors hover:bg-surface-3", active === node.path ? "bg-accent-soft text-fg" : "text-muted hover:text-fg")}>
        {active === node.path && <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-accent" />}
        <FileIcon name={node.name} className="shrink-0" /><span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

export function RepoExplorer({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const wantFile = params.get("file");
  const wantLine = Number(params.get("line")) || undefined;
  const wantEnd = Number(params.get("end")) || undefined;
  const theme = useAppTheme();
  const { toast } = useToast();

  const [files, setFiles] = useState<TreeFile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cache, setCache] = useState<Record<string, FileData | { error: string }>>({});
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("evidence");
  const [results, setResults] = useState<{ q: string; mode: Mode; data: unknown } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lineInput, setLineInput] = useState("");
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<editor.IEditorDecorationsCollection | null>(null);
  const pending = useRef<{ line?: number; end?: number } | undefined>(wantLine ? { line: wantLine, end: wantEnd } : undefined);

  const tree = useMemo(() => (files ? buildTree(files) : []), [files]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/tree`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("tree"))))
      .then((d: { files: TreeFile[] }) => { if (!cancelled) setFiles(d.files); })
      .catch(() => { if (!cancelled) setLoadError("Could not load the file list."); });
    return () => { cancelled = true; };
  }, [projectId]);

  const load = useCallback(async (path: string) => {
    try {
      const r = await fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`);
      const d = await r.json();
      setCache((c) => ({ ...c, [path]: r.ok ? (d as FileData) : { error: (d as { error?: string }).error ?? "Could not load file" } }));
    } catch { setCache((c) => ({ ...c, [path]: { error: "Network error while loading the file" } })); }
  }, [projectId]);

  const reveal = useCallback((line: number, end?: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    decorations.current?.clear();
    decorations.current = ed.createDecorationsCollection([{ range: { startLineNumber: line, startColumn: 1, endLineNumber: end ?? line, endColumn: 1 }, options: { isWholeLine: true, className: "cm-evidence-line" } }]);
  }, []);

  const openFile = useCallback((path: string, at?: { line?: number; end?: number }) => {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive((prev) => {
      if (prev === path && at?.line) reveal(at.line, at.end); // already mounted: jump directly
      return path;
    });
    setOpen((s) => new Set([...s, ...parentsOf(path)]));
    pending.current = at;
    setCache((c) => { if (!c[path]) void load(path); return c; });
  }, [load, reveal]);

  useEffect(() => {
    // Open the file named in the URL once the file list has arrived.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (wantFile && files) openFile(wantFile, wantLine ? { line: wantLine, end: wantEnd } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const closeTab = (p: string) => { const next = tabs.filter((t) => t !== p); setTabs(next); if (active === p) setActive(next[next.length - 1] ?? ""); };
  const toggle = (p: string) => setOpen((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setSearching(true); setSearchError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/search?q=${encodeURIComponent(q)}&mode=${mode}`);
      const d = await r.json();
      if (!r.ok) setSearchError((d as { error?: string }).error ?? "Search failed");
      else setResults({ q, mode, data: d });
    } catch { setSearchError("Search failed — check your connection."); }
    finally { setSearching(false); }
  };

  const current = active ? cache[active] : undefined;
  const file = current && "content" in current ? current : undefined;
  const copy = async () => { if (!file) return; try { await navigator.clipboard.writeText(file.content); setCopied(true); toast("File contents copied"); setTimeout(() => setCopied(false), 1500); } catch { toast("Could not copy", "error"); } };

  if (loadError) return <EmptyState title="Could not load repository" description={loadError} />;

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[500px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card md:flex-row">
      <aside className="flex max-h-80 w-full shrink-0 flex-col border-b border-border bg-surface md:max-h-none md:w-[22rem] md:border-b-0 md:border-r" aria-label="Search and files">
        <form onSubmit={runSearch} className="space-y-2.5 border-b border-border p-3">
          <div className="flex gap-2">
            <label className="block min-w-0 flex-1"><span className="sr-only">Search repository</span><TextInput value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => { setQuery(""); setResults(null); }} icon={<Search />} placeholder="Find auth, validateToken, src/auth…" className="[&_input]:h-9" /></label>
            <Button size="md" type="submit" variant="primary" disabled={searching}>{searching ? "…" : "Search"}</Button>
          </div>
          <Tabs<Mode> label="Search type" size="sm" items={MODES} value={mode} onChange={setMode} className="flex w-full justify-between overflow-x-auto" />
        </form>

        <div className="flex-1 overflow-y-auto py-1.5">
          {results || searchError ? (
            <SearchResults results={results} error={searchError} onClear={() => { setResults(null); setSearchError(null); }} openFile={openFile} />
          ) : files === null ? (
            <div className="space-y-2.5 p-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-3/5" /></div>
          ) : files.length === 0 ? (
            <p className="p-5 text-sm text-muted">No indexable files were found in this repository.</p>
          ) : (
            <ul role="tree" aria-label="Repository files">{tree.map((n) => <TreeNode key={n.path} node={n} depth={0} open={open} toggle={toggle} active={active} onOpen={(p) => openFile(p)} />)}</ul>
          )}
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-subtle">{files ? `${files.length} indexed files` : "Loading…"}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div role="tablist" aria-label="Open files" className="flex overflow-x-auto border-b border-border bg-surface-2">
          {tabs.map((t) => (
            <div key={t} className={cn("group relative flex shrink-0 items-center border-r border-border transition-colors", active === t ? "bg-[var(--editor-bg)] text-fg" : "text-muted hover:bg-surface-3")}>
              {active === t && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-accent" />}
              <button role="tab" aria-selected={active === t} onClick={() => setActive(t)} className="flex h-10 items-center gap-2 pl-3.5 pr-1.5 text-sm"><FileIcon name={t} />{t.split("/").pop()}</button>
              <button onClick={() => closeTab(t)} aria-label={`Close ${t}`} className="mr-2 rounded-md p-1 text-subtle opacity-60 transition-all hover:bg-surface-4 hover:text-fg group-hover:opacity-100"><X className="size-3.5" /></button>
            </div>
          ))}
        </div>

        {!active ? (
          <EmptyState className="m-6 flex-1 border-0" icon={<FileCode2 />} title="No file open" description="Select a file from the tree, or search the repository for evidence." />
        ) : !current ? (
          <Skeleton className="m-5 h-72" />
        ) : "error" in current ? (
          <EmptyState className="m-6 flex-1" title="Could not open this file" description={current.error} action={<Button onClick={() => { setCache((c) => { const n = { ...c }; delete n[active]; return n; }); void load(active); }}>Retry</Button>} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2">
              <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted">
                {active.split("/").map((seg, i, a) => <span key={i} className="flex items-center gap-1">{i > 0 && <ChevronRight className="size-3.5 text-subtle" />}<span className={i === a.length - 1 ? "font-medium text-fg" : ""}>{seg}</span></span>)}
              </nav>
              <div className="flex items-center gap-2">
                <form onSubmit={(e) => { e.preventDefault(); const n = Number(lineInput); if (n) reveal(n); }} className="flex items-center gap-1.5">
                  <label htmlFor="jump-line" className="sr-only">Jump to line</label>
                  <div className="relative"><Hash className="absolute left-2 top-2 size-3.5 text-subtle" aria-hidden /><input id="jump-line" inputMode="numeric" value={lineInput} onChange={(e) => setLineInput(e.target.value.replace(/\D/g, ""))} placeholder="Line" className="h-8 w-20 rounded-lg border border-border bg-surface-2 pl-7 pr-2 text-sm outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15" /></div>
                  <Button size="sm" type="submit">Go</Button>
                </form>
                <Button size="sm" onClick={copy} icon={copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}>{copied ? "Copied" : "Copy"}</Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="min-h-0 min-w-0 flex-1 bg-[var(--editor-bg)]">
                <Editor
                  key={file!.path}
                  path={file!.path}
                  language={file!.language}
                  value={file!.content}
                  theme={monacoThemeName(theme)}
                  beforeMount={defineCodeMindThemes}
                  options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: "on", fontSize: 13.5, fontFamily: EDITOR_FONT, lineHeight: 22, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 12, bottom: 12 }, renderLineHighlight: "line", smoothScrolling: true }}
                  onMount={(ed) => { editorRef.current = ed; decorations.current = null; if (pending.current?.line) { reveal(pending.current.line, pending.current.end); pending.current = undefined; } }}
                />
              </div>
              <MetaPanel file={file!} onJump={(l, e) => reveal(l, e)} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2 px-4 py-1.5 text-xs text-subtle">
              <span className="font-medium text-muted">{file!.language}</span>
              <span>{file!.meta.lines} lines</span>
              <span>{(file!.meta.size / 1024).toFixed(1)} KB</span>
              <span className="font-mono">@ {file!.commitSha.slice(0, 7)}</span>
              <span className="ml-auto">Read-only · indexed commit</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetaSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <details open className="group border-b border-border last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-subtle transition-colors hover:text-fg">
        <span>{title}{typeof count === "number" && <span className="ml-1.5 font-mono normal-case text-subtle">{count}</span>}</span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-3.5">{children}</div>
    </details>
  );
}

function MetaPanel({ file, onJump }: { file: FileData; onJump: (l: number, e?: number) => void }) {
  return (
    <aside aria-label="File details" className="max-h-64 w-full shrink-0 overflow-y-auto border-t border-border bg-surface text-sm lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
      <MetaSection title="Symbols" count={file.symbols.length}>
        {file.symbols.length ? <ul className="space-y-0.5">{file.symbols.map((s, i) => (
          <li key={i}><button onClick={() => onJump(s.lineStart, s.lineEnd)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-3">
            <span className="truncate font-mono text-xs">{s.parent ? `${s.parent}.` : ""}{s.name}</span><span className="shrink-0 text-xs text-subtle">{s.kind} · {s.lineStart}</span>
          </button></li>
        ))}</ul> : <p className="text-xs text-subtle">No symbols extracted.</p>}
      </MetaSection>
      {file.meta.imports.length > 0 && (
        <MetaSection title="Dependencies" count={file.meta.imports.length}>
          <ul className="space-y-1 font-mono text-xs text-muted">{file.meta.imports.slice(0, 20).map((i) => <li key={i} className="truncate">{i}</li>)}</ul>
        </MetaSection>
      )}
      <MetaSection title="Git history" count={file.commits.length}>
        {file.commits.length ? <ul className="space-y-3">{file.commits.map((c) => <li key={c.sha} className="flex gap-2.5"><GitCommit className="mt-0.5 size-3.5 shrink-0 text-subtle" /><div className="min-w-0"><p className="truncate text-sm">{c.message.split("\n")[0]}</p><p className="text-xs text-subtle"><span className="font-mono">{c.sha.slice(0, 7)}</span> · {c.authorName} · {new Date(c.authoredAt).toLocaleDateString()}</p></div></li>)}</ul> : <p className="text-xs text-subtle">No indexed commits touched this file.</p>}
      </MetaSection>
    </aside>
  );
}

function SearchResults({ results, error, onClear, openFile }: { results: { q: string; mode: Mode; data: unknown } | null; error: string | null; onClear: () => void; openFile: (p: string, at?: { line?: number; end?: number }) => void }) {
  const head = (n: number) => (
    <div className="flex items-center justify-between px-4 py-2 text-xs text-subtle"><span>{n} result{n === 1 ? "" : "s"}{results ? ` for “${results.q}”` : ""}</span><button onClick={onClear} className="font-medium text-accent-strong hover:underline">Back to files</button></div>
  );
  if (error) return <div className="p-4 text-sm"><p role="alert" className="text-danger">{error}</p><button onClick={onClear} className="mt-2 text-accent-strong hover:underline">Back to files</button></div>;
  if (!results) return null;
  const d = results.data as Record<string, unknown>;
  const Empty = <p className="px-4 py-5 text-sm text-muted">Nothing in the index matches. CodeMind only reports what it finds in the repository.</p>;

  if (results.mode === "evidence") {
    const ev = (d.evidence as EvidenceItem[]) ?? [];
    return <div>{head(ev.length)}{ev.length ? <div className="space-y-3 p-3">{ev.map((e) => <EvidenceResultCard key={e.id} item={e} />)}</div> : Empty}</div>;
  }
  const rows = (d.results as Record<string, unknown>[]) ?? [];
  const item = "block w-full px-4 py-2 text-left transition-colors hover:bg-surface-3";
  return (
    <div>{head(rows.length)}{rows.length === 0 ? Empty : <ul>{rows.map((r, i) => (
      <li key={i}>
        {results.mode === "files" && <button className={item} onClick={() => openFile(r.path as string)}><span className="block truncate font-mono text-sm">{r.path as string}</span><Badge className="mt-1">{r.language as string}</Badge></button>}
        {results.mode === "symbols" && <button className={item} onClick={() => openFile(r.filePath as string, { line: r.lineStart as number, end: r.lineEnd as number })}><span className="block truncate font-mono text-sm">{r.parent ? `${r.parent}.` : ""}{r.name as string}</span><span className="text-xs text-subtle">{r.kind as string} · {r.filePath as string}:{r.lineStart as number}</span></button>}
        {results.mode === "code" && <button className={item} onClick={() => openFile(r.filePath as string, { line: r.line as number })}><span className="block truncate font-mono text-sm">{r.text as string}</span><span className="text-xs text-subtle">{r.filePath as string}:{r.line as number}</span></button>}
        {results.mode === "dependencies" && <div className={item}><span className="block font-mono text-sm">{r.name as string}@{r.version as string}{r.dev ? " (dev)" : ""}</span>{(r.users as string[]).map((u) => <button key={u} onClick={() => openFile(u)} className="mr-2 text-xs text-accent-strong hover:underline">{u}</button>)}{(r.users as string[]).length === 0 && <span className="text-xs text-subtle">No imports found in indexed files</span>}</div>}
        {results.mode === "git" && <div className={item}><span className="block truncate text-sm">{r.message as string}</span><span className="text-xs text-subtle"><span className="font-mono">{(r.sha as string).slice(0, 7)}</span> · {r.author as string} · {new Date(r.date as string).toLocaleDateString()}</span>{(r.files as string[]).slice(0, 4).map((f) => <button key={f} onClick={() => openFile(f)} className="mr-2 block text-xs text-accent-strong hover:underline">{f}</button>)}</div>}
      </li>
    ))}</ul>}</div>
  );
}
