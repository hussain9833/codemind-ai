"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, InlineAlert, inputClass } from "@/components/ui/field";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, {});
  const isLogin = mode === "login";
  return (
    <form action={action} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1.5 text-sm text-muted">{isLogin ? "Sign in to continue your investigations." : "Start investigating problems with evidence."}</p>
      </div>

      {state.error && <InlineAlert>{state.error}</InlineAlert>}
      {next && <input type="hidden" name="next" value={next} />}

      {!isLogin && (
        <Field label="Name" hint="Optional">
          <input name="name" autoComplete="name" className={inputClass} />
        </Field>
      )}
      <Field label="Email" error={state.fieldErrors?.email}>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.email} aria-invalid={!!state.fieldErrors?.email} className={inputClass} placeholder="you@company.com" />
      </Field>
      <Field label="Password" error={state.fieldErrors?.password} hint={!isLogin ? "At least 10 characters." : undefined}>
        <input name="password" type="password" required minLength={isLogin ? undefined : 10} autoComplete={isLogin ? "current-password" : "new-password"} aria-invalid={!!state.fieldErrors?.password} className={inputClass} />
      </Field>

      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full" icon={pending ? <Loader2 className="size-4 animate-spin" /> : undefined}>{pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}</Button>

      <p className="text-center text-sm text-muted">
        {isLogin ? "New to CodeMind? " : "Already have an account? "}
        <Link href={isLogin ? "/signup" : "/login"} className="font-medium text-accent-strong underline-offset-4 hover:underline">{isLogin ? "Create an account" : "Sign in"}</Link>
      </p>
    </form>
  );
}
