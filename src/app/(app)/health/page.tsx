import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, PageHeader, ScoreRing } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/field";
import { SAMPLE_HEALTH } from "@/data/sample-health";

export const metadata = { title: "Health" };

export default function HealthPage() {
  return (
    <>
      <PageHeader eyebrow="Codebase" title="Health" description="Repository health by category." actions={<Badge tone="warning">Sample data</Badge>} />
      <div className="mb-6"><InlineAlert tone="warning">These scores are placeholders. They will be replaced by measurements backed by repository evidence; until then they are not a real assessment.</InlineAlert></div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {SAMPLE_HEALTH.categories.map((c, i) => (
          <div key={c.label} className="reveal" style={{ "--i": i } as React.CSSProperties}>
            <Card>
              <CardHeader title={c.label} />
              <CardBody className="flex flex-col items-center gap-3 py-6"><ScoreRing value={c.value} size={112} /><p className="text-center text-xs text-subtle">Detailed findings appear after analysis is available.</p></CardBody>
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}
