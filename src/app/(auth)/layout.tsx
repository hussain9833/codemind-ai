import { Brain, Check } from "lucide-react";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getCurrentUser } from "@/lib/session";

const STEPS = ["Problem", "Evidence", "Hypotheses", "Root cause", "Fix", "Validation", "Human approval", "Pull request"];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="bg-dots bg-glow relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-12 lg:flex">
        <div className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-purple text-accent-fg shadow-pop"><Brain className="size-5" /></span>
          CodeMind AI
        </div>
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">AI engineering investigation</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight">Investigate. Understand. <span className="text-gradient">Fix. Validate.</span></h1>
          <p className="mt-5 text-base text-muted">From a bug report to a reviewed pull request, every conclusion is tied to evidence in your repository, and nothing ships without your approval.</p>
          <ol className="mt-10 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="reveal flex items-center gap-3 text-sm text-muted" style={{ "--i": i } as React.CSSProperties}>
                <span className="grid size-6 place-items-center rounded-full border border-border-strong bg-surface-2 text-accent-strong"><Check className="size-3.5" /></span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-subtle">The repository is the source of truth. The developer stays in control.</p>
      </aside>

      <main className="relative grid place-items-center px-5 py-12">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <div className="w-full max-w-sm animate-in">
          <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold tracking-tight lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-purple text-accent-fg"><Brain className="size-[18px]" /></span>
            CodeMind AI
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
