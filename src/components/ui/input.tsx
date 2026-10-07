"use client";

import { AlertCircle, Eye, EyeOff, Lock, TriangleAlert, X } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Shared shell: icon slot, trailing actions, focus ring and error state in one place. */
const shell =
  "group flex items-center gap-2.5 rounded-lg border bg-surface-2 px-3 shadow-[inset_0_1px_0_rgb(0_0_0/0.04)] transition-all duration-150 hover:border-border-strong focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-accent/15";
const field = "h-10 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-60";
const iconCls = "size-4 shrink-0 text-subtle transition-colors group-focus-within:text-accent-strong";

interface BaseProps { icon?: ReactNode; error?: string; className?: string }

/** Text-like input with a leading icon and optional clear button (controlled usage). */
export function TextInput({ icon, error, className, onClear, ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void }) {
  const hasValue = typeof rest.value === "string" && rest.value.length > 0;
  return (
    <div className={cn(shell, error ? "border-danger" : "border-border", className)}>
      {icon && <span aria-hidden className={cn(iconCls, "grid place-items-center [&>svg]:size-4")}>{icon}</span>}
      <input {...rest} aria-invalid={!!error || undefined} className={field} />
      {onClear && hasValue && (
        <button type="button" onClick={onClear} aria-label="Clear" className="grid size-6 place-items-center rounded-md text-subtle transition-colors hover:bg-surface-3 hover:text-fg"><X className="size-3.5" /></button>
      )}
      {error && <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" />}
    </div>
  );
}

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/** Rough, client-side estimate (length + character variety). Not a security guarantee. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, Math.max(pw.length < 10 ? 1 : s, 1)) as 1 | 2 | 3 | 4;
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score]! };
}

const BAR = ["", "bg-danger", "bg-warning", "bg-info", "bg-success"];

/**
 * Password field with a show/hide (eye) toggle, Caps Lock warning and an optional strength meter.
 * Uncontrolled by default so it works with form actions; `name` is submitted as usual.
 */
export function PasswordInput({ error, className, showStrength, onChange, ...rest }: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const [value, setValue] = useState("");
  const id = useId();
  const strength = passwordStrength(value);
  return (
    <div>
      <div className={cn(shell, error ? "border-danger" : "border-border", className)}>
        <Lock aria-hidden className={iconCls} />
        <input
          {...rest}
          type={visible ? "text" : "password"}
          onChange={(e) => { setValue(e.target.value); onChange?.(e); }}
          onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
          onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
          onBlur={() => setCaps(false)}
          aria-invalid={!!error || undefined}
          aria-describedby={showStrength ? `${id}-strength` : undefined}
          className={field}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
          className="grid size-7 place-items-center rounded-md text-subtle transition-all duration-150 hover:bg-surface-3 hover:text-fg active:scale-90"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {caps && <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-warning"><TriangleAlert className="size-3.5" />Caps Lock is on</p>}
      {showStrength && (
        <div id={`${id}-strength`} className="mt-2.5" aria-live="polite">
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3, 4].map((n) => <span key={n} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", strength.score >= n ? BAR[strength.score] : "bg-surface-3")} />)}
          </div>
          <p className="mt-1.5 flex justify-between text-xs text-subtle"><span>{value ? <>Strength: <span className="font-medium text-muted">{strength.label}</span></> : "Use 10+ characters with a mix of letters, numbers and symbols."}</span>{value && <span className="font-mono">{value.length}</span>}</p>
        </div>
      )}
    </div>
  );
}

/** Textarea with a live character counter and the same focus treatment. */
export function TextArea({ error, className, maxLength, value, ...rest }: Omit<BaseProps, "icon"> & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const len = typeof value === "string" ? value.length : 0;
  return (
    <div>
      <textarea
        {...rest}
        value={value}
        maxLength={maxLength}
        aria-invalid={!!error || undefined}
        className={cn("w-full resize-none rounded-lg border bg-surface-2 p-3 text-sm leading-relaxed text-fg outline-none transition-all duration-150 placeholder:text-subtle hover:border-border-strong focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15", error ? "border-danger" : "border-border", className)}
      />
      {maxLength && typeof value === "string" && (
        <p className={cn("mt-1 text-right font-mono text-xs transition-colors", len > maxLength * 0.9 ? "text-warning" : "text-subtle")}>{len}/{maxLength}</p>
      )}
    </div>
  );
}
