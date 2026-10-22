"use client";

import { ArrowLeft, KeyRound, Loader2, Mail, MailCheck, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { requestResetLinkAction, resetPasswordAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, InlineAlert } from "@/components/ui/field";
import { PasswordInput, TextInput } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { RecoveryCodePanel } from "./recovery-code-panel";

type Method = "email" | "code";

/** Email-link reset (default) and recovery-code reset (alternative). */
export function ForgotForm({ emailAvailable }: { emailAvailable: boolean }) {
  const [method, setMethod] = useState<Method>(emailAvailable ? "email" : "code");
  return (
    <div className="space-y-5">
      <div>
        <Link href="/login" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"><ArrowLeft className="size-4" />Back to sign in</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1.5 text-sm text-muted">Choose how you want to prove it is your account.</p>
      </div>
      {emailAvailable && (
        <Tabs<Method> label="Reset method" value={method} onChange={setMethod} className="flex w-full [&>button]:flex-1 [&>button]:justify-center" items={[{ id: "email", label: "Email me a link", icon: <Mail className="size-4" /> }, { id: "code", label: "Recovery code", icon: <KeyRound className="size-4" /> }]} />
      )}
      {method === "email" && emailAvailable ? <EmailLinkForm /> : <RecoveryCodeForm />}
    </div>
  );
}

function EmailLinkForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestResetLinkAction, {});
  if (state.done) {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-5 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-success/15 text-success"><MailCheck className="size-5" /></span>
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted">If an account exists for <span className="font-medium text-fg">{state.email}</span>, we sent a link to reset the password. It works once and expires in 30 minutes.</p>
        <p className="text-xs text-subtle">Nothing arrived? Check spam, or wait a minute and try again.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error && <InlineAlert>{state.error}</InlineAlert>}
      <Field label="Email" error={state.fieldErrors?.email} hint="We will email you a secure link to choose a new password.">
        <TextInput name="email" type="email" required autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} icon={<Mail />} placeholder="you@company.com" />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full" icon={pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}>{pending ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}

function RecoveryCodeForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});

  if (state.done && state.recoveryCode) {
    return (
      <div className="space-y-4">
        <InlineAlert tone="success">Password updated and all devices signed out.</InlineAlert>
        <RecoveryCodePanel
          code={state.recoveryCode}
          title="Your new recovery code"
          intro="The code you just used no longer works. Save this new one: you will need it next time."
          continueLabel="Continue to sign in"
          onContinue={() => router.push("/login?reset=1")}
        />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error && <InlineAlert>{state.error}</InlineAlert>}
      <Field label="Email" error={state.fieldErrors?.email}>
        <TextInput name="email" type="email" required autoComplete="email" defaultValue={state.email} error={state.fieldErrors?.email} icon={<Mail />} placeholder="you@company.com" />
      </Field>
      <Field label="Recovery code" error={state.fieldErrors?.code} hint="The code you saved at signup, like XXXXX-XXXXX-XXXXX-XXXXX. Case and dashes do not matter.">
        <TextInput name="code" required autoComplete="off" autoCapitalize="characters" spellCheck={false} error={state.fieldErrors?.code} icon={<KeyRound />} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" className="[&_input]:font-mono [&_input]:tracking-wider" />
      </Field>
      <Field label="New password" error={state.fieldErrors?.password}>
        <PasswordInput name="password" required minLength={10} autoComplete="new-password" error={state.fieldErrors?.password} showStrength placeholder="Create a strong password" />
      </Field>
      <Field label="Confirm new password" error={state.fieldErrors?.confirm}>
        <PasswordInput name="confirm" required minLength={10} autoComplete="new-password" error={state.fieldErrors?.confirm} placeholder="Repeat the new password" />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full" icon={pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}>{pending ? "Verifying…" : "Reset password"}</Button>
    </form>
  );
}
