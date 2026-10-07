import { AppShell } from "@/components/layout/app-shell";
import { getProjects } from "@/lib/api";
import { getSelectedProjectId } from "@/lib/selected-project";
import { requireUser } from "@/lib/session";

// Server-side auth gate for every page in the application shell.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const projects = await getProjects(user.id);
  const selected = await getSelectedProjectId(projects);
  return (
    <AppShell projects={projects} user={{ name: user.name, email: user.email }} initialProjectId={selected}>
      {children}
    </AppShell>
  );
}
