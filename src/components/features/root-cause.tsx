import { Target } from "lucide-react";
import { ConfidenceBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import type { Investigation } from "@/lib/types";

export function RootCauseCard({ investigation, onViewEvidence, onGenerateFix }: { investigation: Investigation; onViewEvidence: () => void; onGenerateFix: () => void }) {
  const rc = investigation.rootCause;
  if (!rc) return null;
  const supporting = investigation.evidence.filter((e) => rc.evidenceIds.includes(e.id));
  return (
    <section className="relative overflow-hidden rounded-xl border border-purple/40 bg-surface shadow-pop">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple/10 via-transparent to-transparent" />
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-purple/20 px-6 py-4">
        <div className="flex items-center gap-3 text-purple">
          <span className="grid size-9 place-items-center rounded-xl bg-purple/15"><Target className="size-[18px]" aria-hidden /></span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em]">Root cause identified</h2>
            <p className="text-xs text-subtle">Verified against the code, with cited evidence</p>
          </div>
        </div>
        <ConfidenceBadge level={rc.confidence} />
      </header>
      <div className="relative space-y-6 p-6">
        <p className="whitespace-pre-line text-base leading-relaxed text-fg">{rc.explanation}</p>

        {rc.alternatives && rc.alternatives.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Why other hypotheses are weaker</SectionLabel>
            <ul className="space-y-2">{rc.alternatives.map((a) => <li key={a.hypothesis} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-sm"><span className="font-medium">{a.hypothesis}</span><span className="text-muted"> — {a.reason}</span></li>)}</ul>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <dt className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Evidence <span className="font-mono text-success">{supporting.length} supporting</span> · <span className={rc.contradictingIds?.length ? "font-mono text-danger" : "font-mono"}>{rc.contradictingIds?.length ?? 0} contradicting</span></dt>
            <dd className="space-y-1">{supporting.map((e) => <div key={e.id} className="truncate font-mono text-xs text-muted">{e.file ?? e.title}</div>)}</dd>
          </div>
          <div>
            <dt className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Related files</dt>
            <dd className="space-y-0.5">{rc.files.map((f) => <div key={f}><LinkButton href={`/repository?file=${encodeURIComponent(f)}`} variant="ghost" size="sm" className="-ml-2 h-7 font-mono">{f}</LinkButton></div>)}</dd>
            {rc.symbols && rc.symbols.length > 0 && <dd className="mt-2 font-mono text-xs text-muted">{rc.symbols.join(", ")}</dd>}
          </div>
          <div>
            <dt className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Related commits</dt>
            <dd className="space-y-1">{rc.commits.length ? rc.commits.map((c) => <div key={c} className="font-mono text-xs text-muted">{c}</div>) : <span className="text-xs text-subtle">None cited</span>}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-border pt-5">
          <Button onClick={onViewEvidence}>View evidence</Button>
          <LinkButton href={`/repository?file=${encodeURIComponent(rc.files[0] ?? "")}`}>View code</LinkButton>
          <Button variant="primary" onClick={onGenerateFix}>Generate fix</Button>
        </div>
      </div>
    </section>
  );
}
