"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/ui/badge";
import { defineCodeMindThemes, EDITOR_FONT, monacoThemeName, useAppTheme } from "@/components/ui/code-theme";
import type { FixProposal } from "@/lib/types";

const DiffEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-none" />,
});

export function FixDiff({ fix, onReview, onGenerateTests }: { fix: FixProposal; onReview?: () => void; onGenerateTests?: () => void }) {
  const theme = useAppTheme();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 font-mono text-sm">{fix.file}</span>
          <span className="font-mono text-sm text-muted">{fix.changedLines}</span>
          <RiskBadge level={fix.risk} />
        </div>
        <div className="flex gap-2">
          <Button onClick={onReview}>Review changes</Button>
          <Button onClick={onGenerateTests}>Generate tests</Button>
        </div>
      </div>
      <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{fix.explanation}</p>
      <div className="grid grid-cols-2 border-y border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-subtle">
        <span className="px-5 py-2"><span className="mr-2 inline-block size-2 rounded-full bg-danger" />Original</span>
        <span className="border-l border-border px-5 py-2"><span className="mr-2 inline-block size-2 rounded-full bg-success" />Proposed</span>
      </div>
      <DiffEditor
        height={320}
        language="typescript"
        theme={monacoThemeName(theme)}
        beforeMount={defineCodeMindThemes}
        original={fix.original}
        modified={fix.proposed}
        options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 13, fontFamily: EDITOR_FONT, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 12, bottom: 12 } }}
      />
      <p className="px-5 py-3 text-xs text-subtle">Preview only. No files have been modified.</p>
    </div>
  );
}
