"use client";

import { Brain, GitBranch, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { RepoStatusDot } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from "./nav";
import { useProject } from "./project-context";

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Tooltip label={item.label} disabled={!collapsed}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150",
          collapsed && "justify-center px-0",
          active ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-3 hover:text-fg",
        )}
      >
        <span aria-hidden className={cn("absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-accent transition-all duration-200", active ? "opacity-100" : "scale-y-0 opacity-0", collapsed && "-left-2")} />
        <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-accent-strong" : "text-subtle group-hover:text-fg")} aria-hidden />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </Tooltip>
  );
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  /** Mobile drawer variant: never collapsed, closes on navigate. */
  drawer?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, drawer, onNavigate }: Props) {
  const { project } = useProject();
  const c = collapsed && !drawer;
  return (
    <nav aria-label="Primary" className={cn("flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out", c ? "w-[68px]" : "w-64")}>
      <div className={cn("flex h-14 items-center border-b border-border", c ? "justify-center" : "px-5")}>
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="CodeMind home" onClick={onNavigate}>
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-purple text-accent-fg shadow-pop"><Brain className="size-[18px]" /></span>
          {!c && <span className="text-base">CodeMind</span>}
        </Link>
      </div>

      {!c && (
        <div className="px-3 pt-3">
          {project ? (
            <Link href={`/projects/${project.id}`} onClick={onNavigate} className="block rounded-xl border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-border-strong">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Current project</p>
              <p className="mt-1 flex items-center gap-2 truncate text-sm font-medium"><RepoStatusDot status={project.status} />{project.name}</p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted"><GitBranch className="size-3" aria-hidden />{project.branch}</p>
            </Link>
          ) : (
            <Link href="/projects/new" onClick={onNavigate} className="block rounded-xl border border-dashed border-border-strong px-3 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-fg">+ Connect a repository</Link>
          )}
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            {!c ? <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">{g.label}</p> : <div className="mx-2 mb-2 h-px bg-border" aria-hidden />}
            <ul className="space-y-0.5">
              {g.items.map((item) => <li key={item.href}><NavLink item={item} collapsed={c} onNavigate={onNavigate} /></li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-border p-3">
        <NavLink item={SETTINGS_ITEM} collapsed={c} onNavigate={onNavigate} />
        {!drawer && (
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} disabled={!collapsed}>
            <button
              onClick={onToggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className={cn("flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg", c && "justify-center px-0")}
            >
              {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
              {!c && <span>Collapse</span>}
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}
