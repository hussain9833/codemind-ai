"use client";

import { Moon, Sun } from "lucide-react";
import { useAppTheme } from "./code-theme";
import { cn } from "@/lib/utils";

/** Light / dark switch. The initial theme is set before paint by the inline script in the root layout. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useAppTheme();
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cm-theme", next); } catch {}
  };
  return (
    <button onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className={cn("grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg", className)}>
      {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
