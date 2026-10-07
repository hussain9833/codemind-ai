import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { RepoAnalysis } from "@/lib/repo/types";

const List = ({ items, empty, mono }: { items: string[]; empty: string; mono?: boolean }) =>
  items.length ? <ul className="space-y-1.5">{items.map((i) => <li key={i} className={mono ? "truncate font-mono text-xs text-muted" : "text-sm"}>{i}</li>)}</ul> : <p className="text-sm text-subtle">{empty}</p>;

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{label}</p>{children}</div>
);

const LANG_COLORS = ["bg-accent", "bg-info", "bg-purple", "bg-success", "bg-warning", "bg-danger"];

/** Everything shown here was derived from the indexed files; empty sections mean "not detected". */
export function AnalysisView({ analysis }: { analysis: RepoAnalysis }) {
  const total = analysis.languages.reduce((n, l) => n + l.lines, 0) || 1;
  const langs = analysis.languages.slice(0, 6);
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <Card className="md:col-span-2">
        <CardHeader title="Languages" description="Share of source lines" />
        <CardBody>
          {langs.length ? (
            <>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Language breakdown">
                {langs.map((l, i) => <span key={l.language} className={LANG_COLORS[i % LANG_COLORS.length]} style={{ flex: l.lines }} title={l.language} />)}
              </div>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {langs.map((l, i) => <li key={l.language} className="flex items-center gap-2 text-sm"><span className={`size-2.5 rounded-full ${LANG_COLORS[i % LANG_COLORS.length]}`} />{l.language}<span className="font-mono text-xs text-subtle">{Math.round((l.lines / total) * 100)}% · {l.files} files</span></li>)}
              </ul>
            </>
          ) : <p className="text-sm text-subtle">No source files detected.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Stack" />
        <CardBody className="space-y-5">
          <Group label="Frameworks"><div className="flex flex-wrap gap-1.5">{analysis.frameworks.length ? analysis.frameworks.map((f) => <Badge key={f} tone="accent">{f}</Badge>) : <span className="text-sm text-subtle">None detected</span>}</div></Group>
          <Group label="Package managers"><div className="flex flex-wrap gap-1.5">{analysis.packageManagers.length ? analysis.packageManagers.map((f) => <Badge key={f}>{f}</Badge>) : <span className="text-sm text-subtle">None detected</span>}</div></Group>
          <Group label="Dependencies"><p className="text-sm"><span className="font-semibold">{analysis.dependencies.filter((d) => !d.dev).length}</span> runtime · <span className="font-semibold">{analysis.dependencies.filter((d) => d.dev).length}</span> dev</p></Group>
          <Group label="External services"><div className="flex flex-wrap gap-1.5">{analysis.externalServices.length ? analysis.externalServices.map((f) => <Badge key={f} tone="info">{f}</Badge>) : <span className="text-sm text-subtle">None detected</span>}</div></Group>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Structure" />
        <CardBody className="space-y-5">
          <Group label="Important directories">
            {analysis.importantDirectories.length ? <ul className="space-y-1.5">{analysis.importantDirectories.map((d) => <li key={d.path} className="flex items-center justify-between gap-3"><span className="font-mono text-xs">{d.path}/</span><span className="text-xs text-muted">{d.role}</span></li>)}</ul> : <p className="text-sm text-subtle">No conventional directories detected.</p>}
          </Group>
          <Group label="Entry points"><List mono items={analysis.entryPoints} empty="No entry points detected." /></Group>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Authentication" />
        <CardBody><List items={analysis.authentication} empty="No authentication code or libraries detected." /></CardBody>
      </Card>
      <Card>
        <CardHeader title="Database layer" />
        <CardBody><List items={analysis.database} empty="No database libraries or data-layer files detected." /></CardBody>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader title="API routes" description={`${analysis.apiRoutes.length} detected`} />
        <CardBody>
          {analysis.apiRoutes.length ? <ul className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">{analysis.apiRoutes.slice(0, 30).map((r, i) => <li key={i} className="flex items-center gap-2"><span className="font-mono text-sm">{r.path}</span>{r.methods.filter(Boolean).map((m) => <Badge key={m} tone="accent">{m.replace(/ .*/, "")}</Badge>)}<span className="truncate text-xs text-subtle">{r.file}</span></li>)}</ul> : <p className="text-sm text-subtle">No API routes detected.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tests" />
        <CardBody><p className="text-sm"><span className="font-semibold">{analysis.tests.files}</span> test files{analysis.tests.frameworks.length ? ` · ${analysis.tests.frameworks.join(", ")}` : ""}</p>{analysis.tests.files === 0 && <p className="mt-2 text-sm text-warning">No tests found in the indexed files.</p>}</CardBody>
      </Card>
      <Card>
        <CardHeader title="Configuration" />
        <CardBody><List mono items={analysis.configuration.slice(0, 10)} empty="No configuration files detected." /></CardBody>
      </Card>
    </div>
  );
}
