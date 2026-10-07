"use client";

import { useId, useState, type ReactElement, cloneElement } from "react";
import { cn } from "@/lib/utils";

/** CSS-positioned tooltip; shows on hover and keyboard focus, linked via aria-describedby. */
export function Tooltip({ label, children, side = "right", disabled }: { label: string; children: ReactElement<Record<string, unknown>>; side?: "right" | "bottom" | "top"; disabled?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (disabled) return children;
  const pos = { right: "left-full top-1/2 ml-3 -translate-y-1/2", bottom: "top-full left-1/2 mt-2 -translate-x-1/2", top: "bottom-full left-1/2 mb-2 -translate-x-1/2" }[side];
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {cloneElement(children, { "aria-describedby": id })}
      <span id={id} role="tooltip" className={cn("pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border-strong bg-surface-4 px-2.5 py-1.5 text-xs font-medium text-fg shadow-pop transition-all duration-150", pos, open ? "opacity-100" : "translate-y-0.5 opacity-0")}>
        {label}
      </span>
    </span>
  );
}
