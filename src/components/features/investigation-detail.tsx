"use client";

import { Activity, Check, Eye, FileDiff, Fingerprint, FlaskConical, GitPullRequest, Lightbulb, Loader2, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, CheckBadge, ConfidenceBadge, SeverityBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Investigation } from "@/lib/types";
import { EvidenceCard, type Stance } from "./evidence";
import { FixDiff } from "./fix-diff";
import { HypothesisCard } from "./hypothesis";
import { RootCauseCard } from "./root-cause";
import { Timeline } from "./timeline";
import { ValidationList } from "./validation";

type StageState = "done" | "active" | "pending";

/** The investigation pipeline, derived only from data that exists. */
function stages(inv: Investigation): { label: string; state: StageState }[] {
  const has = {
    evidence: inv.evidence.length > 0,
    hyp: inv.hypotheses.length > 0,
    rc: !!inv.rootCause || !!inv.insufficient,
    fix: !!inv.fix,
    tests: inv.tests.length > 0,
    validation: inv.validation.some((v) => v.state !== "not-run"),
    review: inv.review.state !== "not-started",
    pr: inv.pullRequest.state !== "none",
  };
  const list: [string, boolean][] = [["Problem", true], ["Evidence", has.evidence], ["Hypotheses", has.hyp], ["Root cause", has.rc], ["Fix", has.fix], ["Tests", has.tests], ["Validation", has.validation], ["Review", has.review], ["PR", has.pr]];
  const firstOpen = list.findIndex(([, done]) => !done);
  return list.map(([label, done], i) => ({ label, state: done ? "done" : i === firstOpen && inv.running ? "active" : "pending" }));
}

function Pipeline({ inv }: { inv: Investigation }) {
  const s = stages(inv);
  return (
    <ol aria-label="Investigation progress" className="mb-6 flex items-center overflow-x-auto rounded-xl border border-border bg-surface p-2.5 shadow-card">
      {s.map((st, i) => (
        <li key={st.label} className="flex flex-1 items-center whitespace-nowrap last:flex-none">
          <span className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors", st.state === "done" ? "text-fg" : st.state === "active" ? "bg-accent-soft text-accent-strong" : "text-subtle")}>
            <span aria-hidden className={cn("grid size-5 place-items-center rounded-full border text-[11px]", st.state === "done" ? "border-success bg-success/15 text-success" : st.state === "active" ? "border-accent text-accent" : "border-border-strong")}>
              {st.state === "done" ? <Check className="size-3" strokeWidth={3} /> : st.state === "active" ? <span className="ring-pulse size-1.5 rounded-full bg-accent" /> : i + 1}
            </span>
            {st.label}
            <span className="sr-only">{st.state === "done" ? " (complete)" : st.state === "active" ? " (in progress)" : " (not started)"}</span>
          </span>
          {i < s.length - 1 && <span aria-hidden className={cn("mx-0.5 h-px min-w-2 flex-1", st.state === "done" ? "bg-success/40" : "bg-border")} />}
        </li>
      ))}
    </ol>
  );
}

/** Long model-written text is clamped; the full text is one click away. */
function Expandable({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  return (
    <div className="mt-3 text-sm text-muted">
      <p className={cn(!open && long && "line-clamp-3")}><span className="font-semibold text-fg">{label}: </span>{text}</p>
      {long && <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 text-xs font-medium text-accent-strong hover:underline">{open ? "Show less" : "Show more"}</button>}
    </div>
  );
}

type EvFilter = "all" | "supports" | "contradicts" | "unverified";

export function InvestigationDetail({ inv, sample }: { inv: Investigation; sample?: boolean }) {
  const [dialog, setDialog] = useState<null | "fix" | "tests" | "review">(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [filter, setFilter] = useState<EvFilter>("all");
  const evidenceRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // While the orchestrator runs, pull the real timeline from the server every few seconds.
  useEffect(() => {
    if (!inv.running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [inv.running, router]);

  const showEvidence = (ids: string[]) => {
    setHighlight(ids);
    setFilter("all");
    evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const rcIds = useMemo(() => inv.rootCause?.evidenceIds ?? [], [inv.rootCause]);
  const conIds = useMemo(() => inv.rootCause?.contradictingIds ?? [], [inv.rootCause]);

  // Stance is only assigned relative to a stated root cause; otherwise nothing is implied.
  const stanceOf = (id: string): Stance | undefined => (inv.rootCause ? (rcIds.includes(id) ? "supports" : conIds.includes(id) ? "contradicts" : "unverified") : undefined);
  const counts = useMemo(() => {
    const c = { supports: 0, contradicts: 0, unverified: 0 };
    for (const e of inv.evidence) { const s = inv.rootCause ? (rcIds.includes(e.id) ? "supports" : conIds.includes(e.id) ? "contradicts" : "unverified") : null; if (s) c[s]++; }
    return c;
  }, [inv.evidence, inv.rootCause, rcIds, conIds]);
  const visible = inv.evidence.filter((e) => filter === "all" || stanceOf(e.id) === filter);

  return (
    <div>
      <PageHeader
        breadcrumb={<Link href="/investigations">Investigations</Link>}
        eyebrow={<span className="font-mono normal-case tracking-normal">{inv.id.slice(0, 14)}</span>}
        title={inv.title}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={inv.status} /><SeverityBadge severity={inv.severity} />{inv.rootCause && <ConfidenceBadge level={inv.confidence} />}<span className="text-subtle">Created {inv.createdAt}</span></span>}
      />

      <Pipeline inv={inv} />

      <div className="mb-5 space-y-3">
        {inv.running && <InlineAlert tone="info"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Investigating — the timeline updates as each real step completes. This can take several minutes.</span></InlineAlert>}
        {inv.error && <InlineAlert>{inv.error}</InlineAlert>}
        {sample && <InlineAlert tone="warning">Sample investigation — illustrative content, not from your repositories.</InlineAlert>}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader icon={<Search className="size-4" />} title="Problem" description="As reported" />
            <CardBody><p className="whitespace-pre-line text-base leading-relaxed">{inv.problem}</p></CardBody>
          </Card>

          {inv.rootCause && <div id="root-cause" className="scroll-mt-4"><RootCauseCard investigation={inv} onViewEvidence={() => showEvidence(rcIds)} onGenerateFix={() => setDialog("fix")} /></div>}

          {inv.insufficient && (
            <section className="rounded-xl border border-warning/40 bg-warning/5 p-6 shadow-card">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-warning">Root cause not determined</h2>
              <p className="mt-3 text-base">{inv.insufficient.message}</p>
              {inv.insufficient.missing && <Expandable label="What would help" text={inv.insufficient.missing} />}
              <p className="mt-3 text-xs text-subtle">CodeMind does not guess. Add logs, a stack trace or reproduction steps and start a new investigation.</p>
            </section>
          )}

          <Card>
            <CardHeader icon={<Lightbulb className="size-4" />} title="Hypotheses" description="Qualitative likelihood: High, Medium or Low. Never a percentage." />
            <CardBody>
              {inv.hypotheses.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {inv.hypotheses.map((h, i) => <HypothesisCard key={h.id} hypothesis={h} index={i + 1} onViewEvidence={() => showEvidence(h.selected ? rcIds : [])} />)}
                </div>
              ) : <EmptyState icon={<Lightbulb />} title={inv.running ? "Generating hypotheses…" : "No hypotheses yet"} description="Possible causes are listed once enough evidence has been gathered." />}
            </CardBody>
          </Card>

          <div ref={evidenceRef} className="scroll-mt-4">
            <Card>
              <CardHeader
                icon={<Fingerprint className="size-4" />}
                title="Evidence"
                description={`${inv.evidence.length} items collected from the repository`}
                actions={inv.rootCause ? (
                  <Tabs<EvFilter> label="Filter evidence" size="sm" value={filter} onChange={setFilter} items={[{ id: "all", label: "All", count: inv.evidence.length }, { id: "supports", label: "Supporting", count: counts.supports }, { id: "contradicts", label: "Contradicting", count: counts.contradicts }, { id: "unverified", label: "Unverified", count: counts.unverified }]} />
                ) : undefined}
              />
              <CardBody>
                {visible.length ? (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{visible.map((e, i) => <EvidenceCard key={e.id} evidence={e} index={i} stance={stanceOf(e.id)} highlighted={highlight.includes(e.id)} />)}</div>
                ) : <EmptyState icon={<Fingerprint />} title={inv.evidence.length ? "No evidence in this view" : inv.running ? "Collecting evidence…" : "No evidence yet"} description={inv.evidence.length ? "Try another filter." : "Evidence appears here as the investigation gathers files, symbols, commits, tests and dependencies."} />}
                {inv.rootCause && <p className="mt-4 text-xs text-subtle">&quot;Unverified&quot; means the item was collected but not cited in the root cause. It is shown for transparency, not as proof.</p>}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader icon={<FileDiff className="size-4" />} title="Proposed fix" />
            {inv.fix ? (
              <FixDiff fix={inv.fix} onReview={() => setDialog("review")} onGenerateTests={() => setDialog("tests")} />
            ) : <CardBody><EmptyState icon={<FileDiff />} title="No fix proposed" description={inv.rootCause ? "A fix can be generated from the root cause. Nothing has been generated or changed." : "A fix can be proposed once a root cause is identified."} /></CardBody>}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader icon={<FlaskConical className="size-4" />} title="Tests" />
              {inv.tests.length ? (
                <ul className="divide-y divide-border">
                  {inv.tests.map((t) => (
                    <li key={t.name} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{t.name}</p><p className="truncate font-mono text-xs text-subtle">{t.file}</p></div>
                      <CheckBadge state={t.state} />
                    </li>
                  ))}
                </ul>
              ) : <CardBody><p className="text-sm text-muted">No tests have been generated. <span className="text-subtle">Tests that prove the fix will be listed here.</span></p></CardBody>}
            </Card>
            <Card>
              <CardHeader icon={<ShieldCheck className="size-4" />} title="Validation" description="Only checks that actually ran show a result" />
              <ValidationList checks={inv.validation} />
            </Card>
            <Card>
              <CardHeader icon={<Eye className="size-4" />} title="AI review" actions={<Badge>{inv.review.state === "not-started" ? "Not started" : inv.review.state}</Badge>} />
              <CardBody><p className="text-sm text-muted">{inv.review.note || "No review requested."}</p></CardBody>
            </Card>
            <Card>
              <CardHeader icon={<GitPullRequest className="size-4" />} title="Pull request" actions={<Badge>{inv.pullRequest.state === "none" ? "None" : inv.pullRequest.state}</Badge>} />
              <CardBody><p className="text-sm text-muted">{inv.pullRequest.note || "No pull request."}</p></CardBody>
            </Card>
          </div>
        </div>

        <aside className="xl:sticky xl:top-0 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto">
          <Card>
            <CardHeader icon={<Activity className="size-4" />} title="Investigation timeline" description={inv.running ? "Live" : "Recorded steps"} />
            <CardBody>{inv.timeline.length ? <Timeline events={inv.timeline} /> : <p className="text-sm text-muted">No events recorded.</p>}</CardBody>
          </Card>
        </aside>
      </div>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog === "fix" ? "Generate fix" : dialog === "tests" ? "Generate tests" : "Review changes"} description="Not available yet" footer={<Button variant="primary" data-autofocus onClick={() => setDialog(null)}>Got it</Button>}>
        <p className="p-5 text-sm text-muted">This step is not enabled yet. No files were changed and nothing was executed.</p>
      </Dialog>
    </div>
  );
}
