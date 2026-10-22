"use client";

import { ArrowLeft, Loader2, Mail, MailCheck, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { requestResetOtpAction, resetWithOtpAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, InlineAlert } from "@/components/ui/field";
import { PasswordInput, TextInput } from "@/components/ui/input";

const RESEND_SECONDS = 60;

/** Two steps: (1) email a 6-digit code, (2) enter the code and choose a new password. */
export function ForgotForm() {
  const [send, sendAction, sending] = useActionState<FormState, FormData>(requestResetOtpAction, {});
  const [verify, verifyAction, verifying] = useActionState<FormState, FormData>(resetWithOtpAction, {});
  const email = send.email ?? verify.email ?? "";
  const step2 = !!send.done;

  // Cooldown before "Resend" is offered (matches the server-side 60 s limit).
  const [wait, setWait] = useState(RESEND_SECONDS);
  useEffect(() => {
    if (!send.done) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWait(RESEND_SECONDS);
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [send]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/login" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"><ArrowLeft className="size-4" />Back to sign in</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{step2 ? "Enter your code" : "Reset your password"}</h1>
        <p className="mt-1.5 text-sm text-muted">{step2 ? <>If an account exists for <span className="font-medium text-fg">{email}</span>, we emailed a 6-digit code. It expires in 10 minutes.</> : "Enter your account email and we will send you a 6-digit code."}</p>
      </div>

      {!step2 ? (
        <form action={sendAction} className="space-y-5" noValidate>
          {send.error && <InlineAlert>{send.error}</InlineAlert>}
          <Field label="Email" error={send.fieldErrors?.email}>
            <TextInput name="email" type="email" required autoComplete="email" defaultValue={send.email} error={send.fieldErrors?.email} icon={<Mail />} placeholder="you@company.com" />
          </Field>
          <Button type="submit" variant="primary" size="lg" disabled={sending} className="w-full" icon={sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}>{sending ? "Sending…" : "Send code"}</Button>
        </form>
      ) : (
        <div className="space-y-5">
          <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-muted"><MailCheck className="mt-0.5 size-4 shrink-0 text-success" />Check your inbox (and spam folder) for the code.</div>

          <form action={verifyAction} className="space-y-5" noValidate>
            <input type="hidden" name="email" value={email} />
            {verify.error && <InlineAlert>{verify.error}</InlineAlert>}
            <Field label="6-digit code" error={verify.fieldErrors?.code}>
              <TextInput name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" error={verify.fieldErrors?.code} icon={<ShieldCheck />} placeholder="123456" className="[&_input]:font-mono [&_input]:text-lg [&_input]:tracking-[0.4em]" />
            </Field>
            <Field label="New password" error={verify.fieldErrors?.password}>
              <PasswordInput name="password" required minLength={10} autoComplete="new-password" error={verify.fieldErrors?.password} showStrength placeholder="Create a strong password" />
            </Field>
            <Field label="Confirm new password" error={verify.fieldErrors?.confirm}>
              <PasswordInput name="confirm" required minLength={10} autoComplete="new-password" error={verify.fieldErrors?.confirm} placeholder="Repeat the new password" />
            </Field>
            <Button type="submit" variant="primary" size="lg" disabled={verifying} className="w-full" icon={verifying ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}>{verifying ? "Verifying…" : "Reset password"}</Button>
          </form>

          <form action={sendAction} className="text-center text-sm text-muted">
            <input type="hidden" name="email" value={email} />
            {wait > 0 ? <span>Didn&apos;t get it? You can resend in {wait}s</span> : <button type="submit" disabled={sending} className="font-medium text-accent-strong underline-offset-4 hover:underline disabled:opacity-60">{sending ? "Sending…" : "Resend code"}</button>}
          </form>
        </div>
      )}
    </div>
  );
}
