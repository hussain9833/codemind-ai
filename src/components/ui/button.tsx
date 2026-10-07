import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-card hover:bg-accent-strong hover:shadow-pop active:translate-y-px",
  secondary:
    "bg-surface-2 text-fg border border-border shadow-card hover:bg-surface-3 hover:border-border-strong active:translate-y-px",
  subtle: "bg-accent-soft text-accent-strong hover:bg-accent/20 active:translate-y-px",
  ghost: "text-muted hover:bg-surface-3 hover:text-fg",
  danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 active:translate-y-px",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2.5",
};

const base =
  "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap";

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", icon, className, children, type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** `plain` renders a normal <a> (no prefetch) for route handlers / external URLs. */
export function LinkButton({ href, variant = "secondary", size = "md", icon, className, children, plain }: Common & { href: string; plain?: boolean }) {
  const cls = cn(base, variants[variant], sizes[size], className);
  if (plain) {
    return (
      <a href={href} className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {icon}
      {children}
    </Link>
  );
}
