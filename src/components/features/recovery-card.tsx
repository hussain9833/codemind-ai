"use client";

import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";
import { regenerateRecoveryCodeAction, type RecoveryState } from "@/app/(app)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, InlineAlert } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/input";
import { RecoveryCodePanel } from "./recovery-code-panel";

/** Account recovery controls for Settings. The code is displayed once and never stored in plain text. */
export function RecoveryCard({ hasCode, createdAt }: { hasCode: boolean; createdAt: string | null }) {
  const [state, action, pending] = useActionState<RecoveryState, FormData>(regenerateRecoveryCodeAction, {});
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (state.recoveryCode && !dismissed) {
    return <RecoveryCodePanel code={state.recoveryCode} title="Your new recovery code" intro="Any previous recovery code has stopped working. Save this one now: it will not be shown again." onContinue={() => { setDismissed(true); setOpen(false); }} />;
  }

  const status = dismissed || state.at ? "just now" : createdAt ? new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  const active = hasCode || dismissed;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={active ? "success" : "warning"}><KeyRound className="size-3" />{active ? "Recovery code active" : "No recovery code"}</Badge>
        {active && status && <span suppressHydrationWarning className="text-sm text-subtle">Created {status}</span>}
      </div>
      <p className="text-sm text-muted">{active ? "If you forget your password, reset it from the sign-in page with your email and this code. Generating a new code immediately disables the old one." : "Without a recovery code you cannot reset a forgotten password. Create one now and keep it somewhere safe."}</p>

      {!open ? (
        <Button onClick={() => setOpen(true)} icon={active ? <RefreshCw className="size-4" /> : <KeyRound className="size-4" />}>{active ? "Generate a new code" : "Create recovery code"}</Button>
      ) : (
        <form action={action} className="max-w-sm space-y-3 rounded-xl border border-border bg-surface-2 p-4">
          {state.error && <InlineAlert>{state.error}</InlineAlert>}
          <Field label="Confirm your password" hint="Required so nobody else can create a code on your account.">
            <PasswordInput name="password" required autoComplete="current-password" placeholder="Your password" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={pending} icon={pending ? <Loader2 className="size-4 animate-spin" /> : undefined}>{pending ? "Generating…" : "Generate code"}</Button>
            <Button onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
