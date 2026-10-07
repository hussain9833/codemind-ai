import { BookOpen, Braces, ExternalLink, FileCode2, FlaskConical, GitCommit, Hash, Package, ScrollText, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Evidence, EvidenceType } from "@/lib/types";
import type { EvidenceItem, EvidenceKind } from "@/lib/repo/types";

/** How a piece of evidence relates to the conclusion being shown. Never implies more certainty than exists. */
export type Stance = "supports" | "contradicts" | "unverified";

const KIND: Record<EvidenceType, { icon: LucideIcon; label: string; tone: Tone; bar: string }> = {
  file: { icon: FileCode2, label: "File", tone: "info", bar: "bg-info" },
  line: { icon: Hash, label: "Lines", tone: "accent", bar: "bg-accent" },
  symbol: { icon: Braces, label: "Symbol", tone: "purple", bar: "bg-purple" },
  commit: { icon: GitCommit, label: "Commit", tone: "warning", bar: "bg-warning" },
  test: { icon: FlaskConical, label: "Test", tone: "success", bar: "bg-success" },
  log: { icon: ScrollText, label: "Log", tone: "danger", bar: "bg-danger" },
  dependency: { icon: Package, label: "Dependency", tone: "info", bar: "bg-info" },
  documentation: { icon: BookOpen, label: "Docs", tone: "neutral", bar: "bg-subtle" },
};

const STANCE: Record<Stance, { label: string; tone: Tone; hint: string }> = {
  supports: { label: "Supports", tone: "success", hint: "Cited as supporting evidence" },
  contradicts: { label: "Contradicts", tone: "danger", hint: "Cited as contradicting evidence" },
  unverified: { label: "Unverified", tone: "neutral", hint: "Collected, but not used in a conclusion" },
};

export const evidenceHref = (e: Evidence) =>
  e.file ? `/repository?file=${encodeURIComponent(e.file)}${e.lines ? `&line=${e.lines[0]}&end=${e.lines[1]}` : ""}` : undefined;

export const repoHref = (e: Pick<EvidenceItem, "filePath" | "lineStart" | "lineEnd">) =>
  e.filePath ? `/repository?file=${encodeURIComponent(e.filePath)}${e.lineStart ? `&line=${e.lineStart}` : ""}${e.lineEnd ? `&end=${e.lineEnd}` : ""}` : undefined;

/** `dir/` dimmed, filename emphasised. */
function PathLabel({ path }: { path: string }) {
  const i = path.lastIndexOf("/");
  return (
    <span className="truncate font-mono text-sm">
      {i >= 0 && <span className="text-subtle">{path.slice(0, i + 1)}</span>}
      <span className="font-medium text-fg">{path.slice(i + 1)}</span>
    </span>
  );
}

function Chip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <span className={cn("rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted", mono && "font-mono")}>{children}</span>;
}

interface CardView {
  type: EvidenceType;
  title: string;
  file?: string;
  lines?: [number, number] | null;
  symbol?: string;
  commit?: string;
  dependency?: string;
  excerpt?: string;
  note?: string;
  reasons?: string[];
}

function EvidenceBody({ v, stance, highlighted, href, external, index }: { v: CardView; stance?: Stance; highlighted?: boolean; href?: string; external?: boolean; index?: number }) {
  const k = KIND[v.type];
  const Icon = k.icon;
  const st = stance ? STANCE[stance] : null;
  const lines = v.lines ? `${v.lines[0]}${v.lines[1] !== v.lines[0] ? `–${v.lines[1]}` : ""}` : null;
  return (
    <div
      style={{ "--i": index ?? 0 } as React.CSSProperties}
      className={cn(
        "reveal group relative overflow-hidden rounded-xl border bg-surface-2 transition-all duration-200",
        highlighted ? "border-accent/60 shadow-pop" : "border-border",
        href && "hover:-translate-y-px hover:border-border-strong hover:shadow-pop",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", k.bar, stance === "unverified" && "opacity-40")} />
      <div className="space-y-3 py-3.5 pl-5 pr-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted"><Icon className="size-4" aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{k.label}</p>
              {v.file ? <PathLabel path={v.file} /> : <p className="truncate font-mono text-sm font-medium">{v.title}</p>}
            </div>
          </div>
          {st && <span title={st.hint}><Badge tone={st.tone}>{st.label}</Badge></span>}
        </div>

        {(lines || v.symbol || v.commit || v.dependency || (v.file && v.title !== v.file)) && (
          <div className="flex flex-wrap gap-1.5">
            {lines && <Chip mono>L{lines}</Chip>}
            {v.symbol && <Chip mono>{v.symbol}()</Chip>}
            {v.commit && <Chip mono>{v.commit.slice(0, 7)}</Chip>}
            {v.dependency && <Chip mono>{v.dependency}</Chip>}
            {v.file && v.title !== v.file && <Chip>{v.title}</Chip>}
          </div>
        )}

        {v.note && <p className="text-sm leading-relaxed text-muted">{v.note}</p>}

        {v.excerpt && (
          <pre className="max-h-32 overflow-hidden whitespace-pre-wrap rounded-lg border border-border bg-[var(--editor-bg)] p-3 font-mono text-xs leading-relaxed text-muted">{v.excerpt}</pre>
        )}

        {v.reasons && v.reasons.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Why this was selected">
            {v.reasons.slice(0, 4).map((r) => <li key={r} className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-subtle">{r}</li>)}
          </ul>
        )}

        {href && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-accent-strong">
            {external ? "Open on GitHub" : "Open in explorer"} <ExternalLink className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </p>
        )}
      </div>
    </div>
  );
}

/** Evidence stored on an investigation. Clickable when it points at code. */
export function EvidenceCard({ evidence, highlighted, stance, className, index }: { evidence: Evidence; highlighted?: boolean; stance?: Stance; className?: string; index?: number }) {
  const href = evidenceHref(evidence);
  const body = (
    <EvidenceBody
      v={{ type: evidence.type, title: evidence.title, file: evidence.file, lines: evidence.lines, symbol: evidence.symbol, commit: evidence.commit, excerpt: evidence.excerpt, note: evidence.note }}
      stance={stance} highlighted={highlighted} href={href} index={index}
    />
  );
  return (
    <article id={`evidence-${evidence.id}`} className={className}>
      {href ? <Link href={href} className="block rounded-xl">{body}</Link> : body}
    </article>
  );
}

const kindToType = (k: EvidenceKind): EvidenceType => k.toLowerCase() as EvidenceType;

/** Evidence produced by the evidence engine (search results). Clickable when it points at code. */
export function EvidenceResultCard({ item, commitUrl }: { item: EvidenceItem; commitUrl?: string }) {
  const href = repoHref(item) ?? (item.commitSha && commitUrl ? `${commitUrl}/${item.commitSha}` : undefined);
  const external = !item.filePath && !!href;
  const body = (
    <EvidenceBody
      v={{ type: kindToType(item.kind), title: item.title, file: item.filePath, lines: item.lineStart ? [item.lineStart, item.lineEnd ?? item.lineStart] : null, symbol: item.symbol, commit: item.commitSha, dependency: item.dependency, excerpt: item.excerpt, reasons: item.reasons }}
      href={href} external={external}
    />
  );
  if (!href) return <article>{body}</article>;
  return external ? <a href={href} target="_blank" rel="noreferrer noopener" className="block rounded-xl">{body}</a> : <Link href={href} className="block rounded-xl">{body}</Link>;
}

export { KIND as EVIDENCE_KIND };
