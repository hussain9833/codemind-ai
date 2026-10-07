import { InvestigationDetail } from "@/components/features/investigation-detail";
import { getInvestigation } from "@/lib/api";
import { requireUser } from "@/lib/session";

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { inv, sample } = await getInvestigation(user.id, id);
  return <InvestigationDetail inv={inv} sample={sample} />;
}
