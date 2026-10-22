"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { resetWithTokenAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, InlineAlert } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetWithTokenAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-muted">Pick a strong password you have not used elsewhere. You will be signed out of all devices.</p>
      </div>
      {state.error && <InlineAlert>{state.error}</InlineAlert>}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" error={state.fieldErrors?.password}>
        <PasswordInput name="password" required minLength={10} autoComplete="new-password" error={state.fieldErrors?.password} showStrength placeholder="Create a strong password" />
      </Field>
      <Field label="Confirm new password" error={state.fieldErrors?.confirm}>
        <PasswordInput name="confirm" required minLength={10} autoComplete="new-password" error={state.fieldErrors?.confirm} placeholder="Repeat the new password" />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full" icon={pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}>{pending ? "Saving…" : "Reset password"}</Button>
    </form>
  );
}
