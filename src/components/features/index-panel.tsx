"use client";

import { Database, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RepoStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, ProgressSteps, type StepState } from "@/components/ui/states";
import type { RepoStatus } from "@/lib/types";

interface Status { indexStatus: "NOT_INDEXED" | "INDEXING" | "INDEXED" | "FAILED"; indexProgress: { stage?: string; detail?: string | null } | null; indexError: string | null; lastIndexedAt: string | null }

const STAGES = ["Reading repository", "Filtering files", "Parsing source", "Analyzing repository", "Reading git history", "Saving index"];

const toBadge = (s: Status["indexStatus"]): RepoStatus => ({ NOT_INDEXED: "not-indexed", INDEXING: "indexing", INDEXED: "indexed", FAILED: "unavailable" }[s] as RepoStatus);

/** Starts indexing and shows genuine progress reported by the server (never simulated). */
export function IndexPanel({ projectId, initial, compact }: { projectId: string; initial: Status; compact?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/index`, { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch { /* transient: next tick retries */ }
  }, [projectId]);

  useEffect(() => {
    if (status.indexStatus !== "INDEXING" && !starting) return;
    timer.current = setInterval(poll, 1500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [status.indexStatus, starting, poll]);

  const start = async () => {
    setStarting(true);
    setError(null);
    setStatus((s) => ({ ...s, indexStatus: "INDEXING", indexProgress: { stage: "Starting" }, indexError: null }));
    try {
      const r = await fetch(`/api/projects/${projectId}/index`, { method: "POST" });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Indexing failed");
    } catch {
      setError("The connection was interrupted. Indexing may still be running — check again in a moment.");
    } finally {
      setStarting(false);
      await poll();
      router.refresh();
    }
  };

  if (status.indexStatus === "INDEXING") {
    const stage = status.indexProgress?.stage ?? "Starting";
    const idx = STAGES.indexOf(stage);
    const steps = STAGES.map((label, i) => ({ label: label === stage && status.indexProgress?.detail ? `${label} — ${status.indexProgress.detail}` : label, state: (idx < 0 ? "waiting" : i < idx ? "done" : i === idx ? "active" : "waiting") as StepState }));
    return <ProgressSteps title="Analyzing repository…" steps={steps} />;
  }

  if (status.indexStatus === "FAILED" || error) {
    return (
      <ErrorState
        title="Repository indexing failed"
        description={error ?? status.indexError ?? "CodeMind could not finish indexing this repository."}
        causes={["The GitHub App no longer has access to the repository or branch", "The repository is larger than the current indexing limits", "GitHub or the database was temporarily unavailable"]}
        actions={<Button variant="primary" onClick={start} icon={<RefreshCw className="size-4" />}>Retry indexing</Button>}
      />
    );
  }

  if (status.indexStatus === "NOT_INDEXED") {
    return (
      <div className="bg-dots rounded-xl border border-dashed border-border-strong p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-border bg-surface-2 text-accent-strong shadow-card"><Database className="size-6" /></span>
        <h3 className="mt-4 text-base font-semibold tracking-tight">Repository not indexed</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">CodeMind reads the selected branch, parses the source and builds a searchable index. Nothing is modified in your repository.</p>
        <div className="mt-5"><Button variant="primary" size="lg" onClick={start} icon={<Database className="size-4" />}>Index repository</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <RepoStatusBadge status={toBadge(status.indexStatus)} />
        {!compact && status.lastIndexedAt && <span suppressHydrationWarning className="text-sm text-muted">Indexed {new Date(status.lastIndexedAt).toLocaleString()}</span>}
        <Button size="sm" onClick={start} icon={<RefreshCw className="size-3.5" />}>Re-index</Button>
      </div>
      {!compact && <SemanticIndex projectId={projectId} />}
    </div>
  );
}

interface Semantic { configured: boolean; embedded: number; total: number; model?: string; dimension?: number }

/** Embedding progress for the semantic (vector) index. Resumable: each call embeds as many chunks as fit in the time budget. */
function SemanticIndex({ projectId }: { projectId: string }) {
  const [s, setS] = useState<Semantic | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { const r = await fetch(`/api/projects/${projectId}/embed`, { cache: "no-store" }); if (r.ok) setS(await r.json()); } catch { /* shown as unknown */ }
  }, [projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const build = async () => {
    setBusy(true); setErr(null);
    try {
      for (let i = 0; i < 20; i++) {
        const r = await fetch(`/api/projects/${projectId}/embed`, { method: "POST" });
        const d = (await r.json()) as Semantic & { done?: boolean; error?: string };
        if (!r.ok) { setErr(d.error ?? "Embedding failed"); break; }
        setS({ configured: true, embedded: d.embedded, total: d.total, model: d.model, dimension: d.dimension });
        if (d.done) break;
      }
    } catch { setErr("The connection was interrupted. Run it again to continue where it stopped."); }
    finally { setBusy(false); }
  };

  if (!s) return null;
  if (!s.configured) return <p className="text-sm text-subtle">Semantic search is off: no AI provider is configured on the server. Exact, symbol, file and git search still work.</p>;
  const done = s.total > 0 && s.embedded >= s.total;
  const pct = s.total ? Math.round((s.embedded / s.total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm">
          <Sparkles className={done ? "size-4 text-success" : "size-4 text-subtle"} aria-hidden />
          <span className="font-medium">Semantic index</span>
          <span className="font-mono text-muted">{s.embedded}/{s.total}</span>
          {s.dimension ? <span className="text-xs text-subtle">{s.dimension}-dim</span> : null}
        </div>
        {!done && <Button size="sm" variant="subtle" onClick={build} disabled={busy}>{busy ? "Building…" : s.embedded ? "Continue" : "Build semantic index"}</Button>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Semantic index progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${done ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}
