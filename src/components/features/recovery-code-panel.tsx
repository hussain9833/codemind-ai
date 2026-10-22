"use client";

import { Check, Copy, Download, KeyRound, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Shows a recovery code exactly once. The user must confirm they saved it before continuing.
 * The code lives only in this component's props; the app never writes it to storage.
 */
export function RecoveryCodePanel({ code, title = "Save your recovery code", intro, continueLabel = "Continue", onContinue }: { code: string; title?: string; intro?: string; continueLabel?: string; onContinue: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); toast("Recovery code copied"); setTimeout(() => setCopied(false), 1800); }
    catch { toast("Could not copy. Select the code and copy it manually.", "error"); }
  };
  const download = () => {
    const blob = new Blob([`CodeMind AI recovery code\n\n${code}\n\nKeep this somewhere safe. It lets you reset your password without email. Each code works once.\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "codemind-recovery-code.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-4 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-strong"><KeyRound className="size-5" /></span>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{intro ?? "This is the only way to reset your password if you forget it. CodeMind does not send emails and cannot show this code again."}</p>
      </div>

      <div className="rounded-xl border border-border-strong bg-surface-2 p-4">
        <p className="select-all break-all text-center font-mono text-lg font-semibold tracking-wider text-fg" aria-label="Recovery code">{code}</p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={copy} icon={copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}>{copied ? "Copied" : "Copy"}</Button>
          <Button className="flex-1" onClick={download} icon={<Download className="size-4" />}>Download</Button>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-warning"><TriangleAlert className="mt-0.5 size-4 shrink-0" />Store it in a password manager or somewhere offline. Anyone with this code and your email can reset your password.</p>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>I have saved my recovery code somewhere safe.</span>
      </label>

      <Button variant="primary" size="lg" className="w-full" disabled={!saved} onClick={onContinue}>{continueLabel}</Button>
    </div>
  );
}
