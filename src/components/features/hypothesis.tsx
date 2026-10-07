import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Hypothesis } from "@/lib/types";

const tone = { high: "success", medium: "warning", low: "neutral" } as const;

const VERIFY = {
  supported: { icon: CheckCircle2, label: "Verified: supported", cls: "text-success" },
  refuted: { icon: XCircle, label: "Verified: refuted", cls: "text-danger" },
  inconclusive: { icon: CircleHelp, label: "Verification inconclusive", cls: "text-warning" },
} as const;

export function HypothesisCard({ hypothesis, index, onViewEvidence }: { hypothesis: Hypothesis; index: number; onViewEvidence?: () => void }) {
  const v = hypothesis.status && hypothesis.status !== "candidate" ? VERIFY[hypothesis.status] : null;
  const total = hypothesis.supporting + hypothesis.contradicting;
  return (
    <article
      style={{ "--i": index } as React.CSSProperties}
      className={cn("reveal relative flex flex-col rounded-xl border bg-surface-2 p-4 transition-all duration-200 hover:border-border-strong hover:shadow-pop", hypothesis.selected ? "border-purple/50 bg-purple/5" : "border-border")}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Possible cause #{index}{hypothesis.selected && <span className="ml-2 text-purple">· Root cause</span>}</p>
        <Badge tone={tone[hypothesis.likelihood]} className="uppercase tracking-wide">{hypothesis.likelihood}</Badge>
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug tracking-tight">{hypothesis.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{hypothesis.summary}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="font-medium text-success">{hypothesis.supporting} supporting</span>
          <span className={cn("font-medium", hypothesis.contradicting ? "text-danger" : "text-subtle")}>{hypothesis.contradicting} contradicting</span>
        </div>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${hypothesis.supporting} supporting, ${hypothesis.contradicting} contradicting evidence`}>
          {total > 0 && <><span className="rounded-full bg-success transition-[flex] duration-500" style={{ flex: hypothesis.supporting }} /><span className="rounded-full bg-danger transition-[flex] duration-500" style={{ flex: hypothesis.contradicting }} /></>}
        </div>
      </div>

      {v && (
        <p className={cn("mt-3 flex items-start gap-1.5 text-xs", v.cls)}>
          <v.icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span><span className="font-semibold">{v.label}</span>{hypothesis.verification && <span className="text-subtle"> — {hypothesis.verification.slice(0, 180)}</span>}</span>
        </p>
      )}
      {!v && hypothesis.status === "candidate" && <p className="mt-3 text-xs text-subtle">Not verified against the code.</p>}

      <button onClick={onViewEvidence} className="mt-4 self-start rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-border-strong hover:bg-surface-3">
        View evidence
      </button>
    </article>
  );
}
