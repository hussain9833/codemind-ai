"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Project } from "@/lib/types";

export interface ShellUser { name: string | null; email: string }

interface Ctx {
  user: ShellUser;
  projects: Project[];
  project: Project | undefined;
  setProjectId: (id: string) => void;
}

const ProjectContext = createContext<Ctx | null>(null);

export function ProjectProvider({ children, projects, user, initialProjectId }: { children: ReactNode; projects: Project[]; user: ShellUser; initialProjectId?: string }) {
  const router = useRouter();
  const [id, setId] = useState<string | undefined>(initialProjectId ?? projects[0]?.id);
  /** Persisted in a cookie so server components render the same project. */
  const setProjectId = (next: string) => {
    setId(next);
    document.cookie = `cm_project=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<Ctx>(() => ({ user, projects, project: projects.find((p) => p.id === id) ?? projects[0], setProjectId }), [user, projects, id]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}
