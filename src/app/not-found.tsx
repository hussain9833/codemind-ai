import { LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="py-10">
      <ErrorState
        title="Page or record not found"
        description="CodeMind could not find what this link points to."
        causes={["The project or investigation was removed", "The link is mistyped or out of date", "You may not have access to this repository"]}
        actions={<><LinkButton href="/projects" variant="primary">Go to Projects</LinkButton><LinkButton href="/">Dashboard</LinkButton></>}
      />
    </div>
  );
}
