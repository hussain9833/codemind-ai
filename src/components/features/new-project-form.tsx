"use client";

import { useActionState } from "react";
import { createProjectAction, type CreateProjectState } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { FolderGit2 } from "lucide-react";
import { Field, InlineAlert, inputClass } from "@/components/ui/field";
import { TextInput } from "@/components/ui/input";

export function NewProjectForm({ installationId, repoId, defaultName, branches, defaultBranch }: { installationId: number; repoId: number; defaultName: string; branches: string[]; defaultBranch: string }) {
  const [state, action, pending] = useActionState<CreateProjectState, FormData>(createProjectAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="installationId" value={installationId} />
      <input type="hidden" name="repoId" value={repoId} />
      {state.error && <InlineAlert>{state.error}</InlineAlert>}
      <Field label="Project name"><TextInput name="name" required maxLength={80} defaultValue={defaultName} icon={<FolderGit2 />} /></Field>
      <Field label="Branch to analyse" hint="CodeMind reads this branch. Nothing is modified."><select name="branch" defaultValue={branches.includes(defaultBranch) ? defaultBranch : branches[0]} className={inputClass + " font-mono"}>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select></Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending}>{pending ? "Creating…" : "Create Project"}</Button>
    </form>
  );
}
