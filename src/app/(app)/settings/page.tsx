import { Brain, Palette, Plug, ShieldCheck, User } from "lucide-react";
import { Badge, Dot } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { githubConfigured, nvidiaConfigured } from "@/lib/env";
import { getConnection } from "@/lib/github";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Settings" };

const SECTIONS = [
  { id: "account", label: "Account", icon: User },
  { id: "github", label: "GitHub", icon: Plug },
  { id: "ai", label: "AI", icon: Brain },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "security", label: "Security", icon: ShieldCheck },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const gh = githubConfigured() ? await getConnection(user.id) : null;
  const ghReady = githubConfigured();
  const aiReady = nvidiaConfigured();

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Settings" description="Account, integrations and preferences." />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-0 space-y-0.5">
            {SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-fg"><s.icon className="size-4 text-subtle" />{s.label}</a></li>)}
          </ul>
        </nav>

        <div className="max-w-3xl space-y-6">
          <Card><div id="account" className="scroll-mt-4" />
            <CardHeader icon={<User className="size-4" />} title="Account" description="Your CodeMind profile" />
            <CardBody><dl className="grid grid-cols-1 gap-5 sm:grid-cols-2"><Stat label="Name" value={user.name || "—"} /><Stat label="Email" value={user.email} /></dl></CardBody>
          </Card>

          <Card><div id="github" className="scroll-mt-4" />
            <CardHeader icon={<Plug className="size-4" />} title="GitHub" description="Repository access via the CodeMind GitHub App" actions={!ghReady ? <Badge tone="warning">Not configured</Badge> : gh ? <Badge tone="success"><Dot tone="success" />Connected</Badge> : <Badge>Not connected</Badge>} />
            <CardBody className="space-y-4">
              {!ghReady ? <p className="text-sm text-muted">The server is missing GitHub App settings. See <span className="font-mono text-xs">docs/GITHUB_APP.md</span>.</p>
                : gh ? <p className="text-sm text-muted">Connected as <span className="font-mono text-fg">@{gh.githubLogin}</span>. CodeMind can only read repositories you selected when installing the app.</p>
                : <p className="text-sm text-muted">Connect GitHub to choose which repositories CodeMind can read.</p>}
              {ghReady && <LinkButton href={gh ? "/api/github/connect" : "/projects/new"} plain={!!gh} variant={gh ? "secondary" : "primary"}>{gh ? "Reconnect GitHub" : "Connect GitHub"}</LinkButton>}
            </CardBody>
          </Card>

          <Card><div id="ai" className="scroll-mt-4" />
            <CardHeader icon={<Brain className="size-4" />} title="AI" description="Models run server-side; your API key never reaches the browser" actions={<Badge tone={aiReady ? "success" : "warning"}>{aiReady ? "Configured" : "Not configured"}</Badge>} />
            <CardBody><p className="text-sm text-muted">{aiReady ? "Questions, semantic search and investigations are available. Every model call is recorded (purpose, model, tokens, duration) without storing prompts." : "Set NVIDIA_API_KEY on the server to enable Ask, semantic search and investigations. Exact, symbol, file and git search work without it."}</p></CardBody>
          </Card>

          <Card><div id="appearance" className="scroll-mt-4" />
            <CardHeader icon={<Palette className="size-4" />} title="Appearance" description="Light and dark themes are designed separately" />
            <CardBody className="flex items-center justify-between gap-4"><p className="text-sm text-muted">Switch between the light and dark theme. Your choice is remembered on this device.</p><div className="rounded-lg border border-border bg-surface-2"><ThemeToggle /></div></CardBody>
          </Card>

          <Card><div id="security" className="scroll-mt-4" />
            <CardHeader icon={<ShieldCheck className="size-4" />} title="Security" description="How your account and data are protected" />
            <CardBody><ul className="list-disc space-y-2 pl-5 text-sm text-muted marker:text-subtle"><li>Passwords are hashed with scrypt; sessions use HttpOnly cookies.</li><li>GitHub tokens are encrypted at rest.</li><li>Forgotten passwords are reset with a one-time code sent to your email.</li><li>Secrets found in source files are redacted before any text reaches a model.</li><li>CodeMind never creates a pull request without your explicit approval.</li></ul></CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
