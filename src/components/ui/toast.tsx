"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
interface Toast { id: number; tone: Tone; message: string }
interface Ctx { toast: (message: string, tone?: Tone) => void }

const ToastContext = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const icon = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const color = { success: "text-success", error: "text-danger", info: "text-info" } as const;

/** Lightweight toast host (aria-live). Used for copy feedback and non-blocking confirmations. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback((message: string, tone: Tone = "success") => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === "error" ? 6000 : 2800);
  }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(92vw,22rem)] flex-col gap-2">
        {items.map((t) => {
          const Icon = icon[t.tone];
          return (
            <div key={t.id} className={cn("animate-toast pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border-strong bg-surface-2 px-3.5 py-2.5 text-sm shadow-modal")}>
              <Icon className={cn("mt-0.5 size-4 shrink-0", color[t.tone])} aria-hidden />
              <p className="flex-1 text-fg">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-subtle transition-colors hover:text-fg"><X className="size-3.5" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
