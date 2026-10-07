import "server-only";
import { cookies } from "next/headers";

/** Project chosen in the top bar (cookie), validated against the user's own project list. */
export async function getSelectedProjectId(projects: { id: string }[]): Promise<string | undefined> {
  const raw = (await cookies()).get("cm_project")?.value;
  const id = raw ? decodeURIComponent(raw) : undefined;
  return projects.find((p) => p.id === id)?.id ?? projects[0]?.id;
}
