"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-10">
      <ErrorState
        title="This page failed to load"
        description={error.message || "An unexpected error interrupted rendering this page."}
        causes={["A data request failed or returned unexpected data", "The connection to the repository was interrupted"]}
        actions={<><Button variant="primary" onClick={reset}>Retry</Button><LinkButton href="/">Back to Dashboard</LinkButton></>}
      />
    </div>
  );
}
