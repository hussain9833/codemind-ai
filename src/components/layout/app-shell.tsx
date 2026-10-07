"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./command-palette";
import type { Project } from "@/lib/types";
import { ProjectProvider, type ShellUser } from "./project-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children, projects, user, initialProjectId }: { children: ReactNode; projects: Project[]; user: ShellUser; initialProjectId?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);

  useEffect(() => {
    // Restore persisted preference after mount (avoids SSR hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { if (localStorage.getItem("cm-sidebar") === "collapsed") setCollapsed(true); } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem("cm-sidebar", c ? "expanded" : "collapsed"); } catch {}
    return !c;
  });

  return (
    <ProjectProvider projects={projects} user={user} initialProjectId={initialProjectId}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">Skip to content</a>
      <div className="flex h-dvh overflow-hidden">
        <div className="hidden lg:block"><Sidebar collapsed={collapsed} onToggle={toggle} /></div>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[3px]" onClick={() => setDrawer(false)} />
            <div className="animate-slide-in absolute inset-y-0 left-0 shadow-modal"><Sidebar collapsed={false} drawer onToggle={() => {}} onNavigate={() => setDrawer(false)} /></div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setDrawer(true)} onSearch={() => setSearch(true)} />
          <main id="main" tabIndex={-1} className="bg-dots relative min-h-0 flex-1 overflow-y-auto outline-none">
            <div className="mx-auto min-w-0 max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </ProjectProvider>
  );
}
