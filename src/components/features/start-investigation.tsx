"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, InlineAlert, inputClass } from "@/components/ui/field";
import { TextArea } from "@/components/ui/input";
import { useProject } from "@/components/layout/project-context";

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function StartInvestigationButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const { project } = useProject();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("MEDIUM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!busy) { setOpen(false); setError(null); } };

  const submit = async () => {
    if (!project) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/projects/${project.id}/investigations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem: text, severity }) });
      const d = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !d.id) { setError(d.error ?? "Could not start the investigation."); return; }
      router.push(`/investigations/${d.id}`);
    } catch { setError("The connection was interrupted. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button variant={variant} icon={<Search className="size-3.5" />} onClick={() => setOpen(true)}>Start Investigation</Button>
      <Dialog
        open={open}
        onClose={close}
        title="Start Investigation"
        description={project ? `CodeMind will investigate ${project.repository} using repository evidence.` : "Create a project first."}
        footer={<><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy || !project || text.trim().length < 15} onClick={submit} icon={busy ? <Loader2 className="size-3.5 animate-spin" /> : undefined}>{busy ? "Starting…" : "Start Investigation"}</Button></>}
      >
        <div className="space-y-3 p-4">
          {error && <InlineAlert>{error}</InlineAlert>}
          {project && project.status !== "indexed" && <InlineAlert tone="warning">This repository is not indexed yet. Index it from the project page first.</InlineAlert>}
          <Field label="What is going wrong?" hint="Be concrete: the symptom, where it happens, error messages, and what you have already ruled out."><TextArea data-autofocus value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={4000} placeholder="Describe the symptom, where it happens and anything you have already ruled out…" className="min-h-36" /></Field>
          <Field label="Severity"><select value={severity} onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])} className={inputClass}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
            </select></Field>
        </div>
      </Dialog>
    </>
  );
}
