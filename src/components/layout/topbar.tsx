"use client";

import { Bell, Check, ChevronDown, ChevronsUpDown, GitBranch, LogOut, Menu, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { RepoStatusBadge, RepoStatusDot } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { useProject } from "./project-context";

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

const popover = "animate-pop absolute top-full z-50 mt-2 rounded-xl border border-border-strong bg-surface p-1.5 shadow-modal";

function ProjectSelector() {
  const { project, projects, setProjectId } = useProject();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  if (!project) {
    return <Link href="/projects/new" className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-border-strong px-3.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg">Create your first project</Link>;
  }
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 text-left shadow-card transition-all duration-150 hover:border-border-strong"
      >
        <RepoStatusDot status={project.status} />
        <span className="min-w-0">
          <span className="block max-w-28 truncate text-sm font-semibold leading-tight sm:max-w-44">{project.name}</span>
          <span className="hidden items-center gap-1 text-xs leading-tight text-subtle md:flex">
            <GitBranch className="size-3" aria-hidden /> {project.branch}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 text-subtle" aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label="Select project" className="animate-pop fixed inset-x-3 top-[4.25rem] z-50 rounded-xl border border-border-strong bg-surface p-1.5 shadow-modal sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[22rem]">
          {projects.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === project.id}>
              <button
                onClick={() => { setProjectId(p.id); setOpen(false); }}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-3", p.id === project.id && "bg-accent-soft")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-subtle"><GitBranch className="size-3" />{p.branch} · {p.repository}</span>
                </span>
                <RepoStatusBadge status={p.status} />
                {p.id === project.id && <Check className="size-4 text-accent" aria-label="Selected" />}
              </button>
            </li>
          ))}
          <li className="mt-1 border-t border-border pt-1"><Link href="/projects/new" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-3 hover:text-fg">+ Add project</Link></li>
        </ul>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications" aria-expanded={open} className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg">
        <Bell className="size-[18px]" />
      </button>
      {open && (
        <div className={cn(popover, "right-0 w-80 max-w-[calc(100vw-1.5rem)] p-5 text-center")}>
          <span className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-surface-3 text-muted"><Bell className="size-5" /></span>
          <p className="text-sm font-semibold">You&apos;re all caught up</p>
          <p className="mt-1 text-xs text-muted">Notifications about investigations, validations and pull requests will appear here.</p>
        </div>
      )}
    </div>
  );
}

function Avatar({ initials, size = "md" }: { initials: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-purple font-semibold text-white shadow-card ring-2 ring-surface", size === "lg" ? "size-11 text-base" : "size-8 text-xs")}>
      {initials}
      <span aria-hidden className={cn("absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface bg-success", size === "lg" ? "size-3.5" : "size-2.5")} />
    </span>
  );
}

function Profile() {
  const { user } = useProject();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn("flex h-10 items-center gap-2 rounded-full border border-transparent py-1 pl-1 pr-2 transition-all duration-150 hover:border-border hover:bg-surface-3 sm:pr-2.5", open && "border-border bg-surface-3")}
      >
        <Avatar initials={initials} />
        <ChevronDown aria-hidden className={cn("hidden size-3.5 text-subtle transition-transform duration-200 sm:block", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className={cn(popover, "right-0 w-72 max-w-[calc(100vw-1.5rem)] p-0")}>
          <div className="flex items-center gap-3 border-b border-border px-4 py-4">
            <Avatar initials={initials} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name || "Account"}</p>
              <p className="truncate text-xs text-subtle">{user.email}</p>
            </div>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface-3 hover:text-fg"><Settings className="size-4" />Settings</Link>
            <form action={logoutAction}>
              <button role="menuitem" type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-danger/10 hover:text-danger"><LogOut className="size-4" />Sign out</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md sm:px-6">
      <button onClick={onMenu} aria-label="Open navigation" className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 lg:hidden">
        <Menu className="size-[18px]" />
      </button>
      <ProjectSelector />
      <button
        onClick={onSearch}
        aria-label="Open search"
        className="ml-auto flex h-10 min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 text-sm text-subtle shadow-card transition-all duration-150 hover:border-border-strong hover:text-muted sm:mx-auto sm:w-full sm:max-w-lg sm:px-3.5"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden flex-1 truncate text-left sm:block">Search code, symbols, investigations…</span>
        <kbd className="hidden rounded-md border border-border-strong bg-surface px-1.5 py-0.5 font-mono text-xs sm:inline">Ctrl K</kbd>
      </button>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <div className="hidden sm:block"><Notifications /></div>
        <Profile />
      </div>
    </header>
  );
}
