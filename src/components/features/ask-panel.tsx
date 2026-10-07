"use client";

import { AlertTriangle, ArrowUp, Check, Copy, FileCode2, Fingerprint, GitCommit, Hash, Info, Package, Sparkles, Braces, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/card";
import { WorkingIndicator } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { repoHref } from "./evidence";

interface Ref { ref: string; kind: string; title: string; filePath?: string; lineStart?: number; lineEnd?: number; symbol?: string; commitSha?: string; dependency?: string }
interface Answer { answer: string; insufficient: boolean; references: Ref[]; model: string | null; usedVector: boolean; notes: string[]; removedUnverified: string[] }
interface Turn { question: string; result?: Answer; error?: string; startedAt: number }

const SUGGESTIONS = [
  { q: "How does authentication work in this repository?", hint: "Architecture" },
  { q: "Where are API routes defined?", hint: "Navigation" },
  { q: "Which tests cover the login flow?", hint: "Tests" },
];

const KIND_ICON: Record<string, typeof FileCode2> = { FILE: FileCode2, LINE: Hash, SYMBOL: Braces, COMMIT: GitCommit, TEST: FlaskConical, DEPENDENCY: Package, DOCUMENTATION: FileCode2 };

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); toast("Code copied"); setTimeout(() => setCopied(false), 1500); } catch { toast("Could not copy", "error"); } };
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-[var(--editor-bg)]">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="font-mono text-xs text-subtle">{lang || "code"}</span>
        <button onClick={copy} aria-label="Copy code" className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-surface-3 hover:text-fg">{copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[0.8125rem] leading-relaxed">{code}</pre>
    </div>
  );
}

function inline(text: string, onCite: (ref: string) => void): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[E\d+\])/g).map((t, i) => {
    if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return <code key={i} className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-strong">{t.slice(1, -1)}</code>;
    if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return <strong key={i} className="font-semibold text-fg">{t.slice(2, -2)}</strong>;
    const m = t.match(/^\[(E\d+)\]$/);
    if (m) return <button key={i} onClick={() => onCite(m[1]!)} aria-label={`Jump to evidence ${m[1]}`} className="mx-0.5 inline-flex h-[1.15rem] -translate-y-px items-center rounded-md bg-accent-soft px-1.5 align-baseline font-mono text-[0.7rem] font-semibold text-accent-strong transition-colors hover:bg-accent/25">{m[1]}</button>;
    return t;
  });
}

/** Safe markdown subset: paragraphs, headings, lists, code fences. No HTML is ever injected. */
function Rich({ text, onCite }: { text: string; onCite: (ref: string) => void }) {
  const blocks = text.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return (
    <div className="text-[0.9375rem] leading-[1.7] text-fg">
      {blocks.map((b, i) => {
        if (b.startsWith("```")) { const m = b.match(/^```(\w*)\n?([\s\S]*?)```$/); return <CodeBlock key={i} lang={m?.[1] ?? ""} code={(m?.[2] ?? b).replace(/\n$/, "")} />; }
        const lines = b.split("\n");
        const out: ReactNode[] = [];
        let list: { ordered: boolean; items: string[] } | null = null;
        const flush = () => { if (!list) return; const L = list; out.push(L.ordered ? <ol key={`l${out.length}`} className="my-2 list-decimal space-y-1.5 pl-5 marker:text-subtle">{L.items.map((x, j) => <li key={j}>{inline(x, onCite)}</li>)}</ol> : <ul key={`l${out.length}`} className="my-2 list-disc space-y-1.5 pl-5 marker:text-subtle">{L.items.map((x, j) => <li key={j}>{inline(x, onCite)}</li>)}</ul>); list = null; };
        for (const line of lines) {
          const ul = line.match(/^\s*[-*]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^#{1,4}\s+(.*)/);
          if (ul || ol) { const ordered = !!ol; if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; } list.items.push((ul ?? ol)![1]!); continue; }
          flush();
          if (h) out.push(<h4 key={out.length} className="mb-1 mt-4 text-sm font-semibold tracking-tight">{inline(h[1]!, onCite)}</h4>);
          else if (line.trim()) out.push(<p key={out.length} className="my-2">{inline(line, onCite)}</p>);
        }
        flush();
        return <div key={i}>{out}</div>;
      })}
    </div>
  );
}

function EvidenceRef({ r, active }: { r: Ref; active: boolean }) {
  const href = repoHref(r);
  const Icon = KIND_ICON[r.kind] ?? FileCode2;
  const label = r.filePath ?? r.title;
  const dir = r.filePath ? r.filePath.slice(0, r.filePath.lastIndexOf("/") + 1) : "";
  const body = (
    <div id={`ref-${r.ref}`} className={cn("flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 transition-all duration-200", active ? "border-accent shadow-pop ring-2 ring-accent/20" : "border-border hover:border-border-strong")}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm"><span className="text-subtle">{dir}</span><span className="font-medium">{label.slice(dir.length)}</span></p>
        <p className="flex flex-wrap gap-x-3 text-xs text-subtle">
          <span className="font-semibold uppercase tracking-wider">{r.kind}</span>
          {r.lineStart && <span className="font-mono">L{r.lineStart}{r.lineEnd && r.lineEnd !== r.lineStart ? `–${r.lineEnd}` : ""}</span>}
          {r.symbol && <span className="font-mono">{r.symbol}()</span>}
        </p>
      </div>
      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-accent-strong">{r.ref}</span>
    </div>
  );
  return href ? <Link href={href} className="block rounded-lg">{body}</Link> : body;
}

function Response({ result, elapsed }: { result: Answer; elapsed?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const cite = (ref: string) => { setActive(ref); document.getElementById(`ref-${ref}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => setActive(null), 2200); };
  return (
    <div className="animate-in overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-5 py-2.5">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-strong"><Sparkles className="size-3.5" />AI response</p>
        {result.insufficient
          ? <Badge tone="warning"><AlertTriangle className="size-3" />Insufficient evidence</Badge>
          : <Badge tone="success"><Fingerprint className="size-3" />Evidence-backed · {result.references.length} reference{result.references.length === 1 ? "" : "s"}</Badge>}
      </div>
      <div className="space-y-5 px-5 py-4">
        <section>
          <SectionLabel>{result.insufficient ? "Conclusion" : "Summary"}</SectionLabel>
          <div className={cn("mt-2", result.insufficient && "rounded-lg border border-warning/30 bg-warning/5 px-4 py-1")}><Rich text={result.answer} onCite={cite} /></div>
        </section>

        {result.references.length > 0 && (
          <section>
            <SectionLabel>Evidence</SectionLabel>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {result.references.map((r) => <li key={r.ref}><EvidenceRef r={r} active={active === r.ref} /></li>)}
            </ul>
          </section>
        )}

        {(result.removedUnverified.length > 0 || result.notes.length > 0) && (
          <section className="space-y-2">
            <SectionLabel>Notes</SectionLabel>
            {result.removedUnverified.length > 0 && <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Removed {result.removedUnverified.length} file reference(s) that could not be verified in the repository index.</p>}
            {result.notes.map((n) => <p key={n} className="flex items-start gap-2 text-sm text-muted"><Info className="mt-0.5 size-4 shrink-0 text-subtle" />{n}</p>)}
          </section>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2/60 px-5 py-2 text-xs text-subtle">
        <span>{result.model ? <>Model <span className="font-mono text-muted">{result.model}</span></> : "No model call — no evidence matched"}</span>
        <span>{result.usedVector ? "Exact + semantic search" : "Exact search only"}</span>
        {typeof elapsed === "number" && <span>Answered in {elapsed}s</span>}
      </footer>
    </div>
  );
}

export function AskPanel({ projectId, repository }: { projectId: string; repository: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState<Record<number, number>>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);
  useEffect(() => { if (!busy) return; const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, [busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true); setQ(""); setTick(0);
    const idx = turns.length;
    // eslint-disable-next-line react-hooks/purity -- runs in an event handler, not during render
    const started = Date.now();
    const history = turns.filter((t) => t.result).slice(-3).map((t) => ({ question: t.question, answer: t.result!.answer }));
    setTurns((t) => [...t, { question: text, startedAt: started }]);
    try {
      const r = await fetch(`/api/projects/${projectId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history }) });
      const d = await r.json();
      setTurns((t) => t.map((x, i) => (i === idx ? (r.ok ? { ...x, result: d as Answer } : { ...x, error: (d as { error?: string }).error ?? "Request failed" }) : x)));
      setDone((m) => ({ ...m, [idx]: Math.round((Date.now() - started) / 1000) }));
    } catch { setTurns((t) => t.map((x, i) => (i === idx ? { ...x, error: "The connection was interrupted." } : x))); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6" aria-live="polite">
        {turns.length === 0 && (
          <div className="bg-glow mx-auto max-w-2xl rounded-2xl px-4 py-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-border bg-surface-2 text-accent-strong shadow-card"><Sparkles className="size-6" /></span>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">Ask about <span className="font-mono text-lg">{repository}</span></h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">Answers are built only from evidence found in the indexed repository, with references you can open. If the evidence is not there, CodeMind says so.</p>
            <div className="mt-7 grid gap-2 sm:grid-cols-3">
              {SUGGESTIONS.map((s) => (
                <button key={s.q} onClick={() => ask(s.q)} className="rounded-xl border border-border bg-surface-2 p-3.5 text-left transition-all duration-150 hover:-translate-y-px hover:border-accent/50 hover:shadow-pop">
                  <span className="text-xs font-semibold uppercase tracking-wider text-subtle">{s.hint}</span>
                  <span className="mt-1 block text-sm">{s.q}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="mx-auto max-w-4xl space-y-4">
            <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-fg shadow-card">{t.question}</p></div>
            {t.error ? <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{t.error}</div>
              : !t.result ? <div className="rounded-xl border border-border bg-surface-2 px-5 py-4"><WorkingIndicator label="Searching the repository and reading evidence…" elapsedSeconds={tick} /><p className="mt-2 text-xs text-subtle">This can take up to a minute.</p></div>
              : <Response result={t.result} elapsed={done[i]} />}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="border-t border-border bg-surface-2/50 p-4">
        <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-card transition-all focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
          <label className="sr-only" htmlFor="ask-input">Question</label>
          <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={1500} placeholder="Why does the login API return 401 after refresh?" className="h-10 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-subtle" />
          <button type="submit" disabled={busy || q.trim().length < 3} aria-label="Send question" className="grid size-9 place-items-center rounded-lg bg-accent text-accent-fg transition-all hover:bg-accent-strong active:scale-95 disabled:opacity-40"><ArrowUp className="size-[18px]" /></button>
        </div>
      </form>
    </div>
  );
}
