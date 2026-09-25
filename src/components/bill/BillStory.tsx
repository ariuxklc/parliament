import { ExplainerCard } from "./ExplainerCard";
import { BillJourney } from "./BillJourney";
import { OpinionPoll } from "./OpinionPoll";
import { getApprovedExplainer } from "@/lib/summaries/store";

interface BillStoryProps {
  bill: { id: number; url: string; stage: "drafting" | "submitted"; publishedDate: string };
  row?: { submittedDate: string | null; snapshotDate: string; stages: { label: string; committeeNote: string; plenaryNote: string }[] } | null;
}

/**
 * Citizen-facing top of the bill page, in reading order:
 * understand it (approved explainer + video) → where it is (journey) → what do you think (opinion).
 * The explainer appears only after a person approved it in /review.
 */
export async function BillStory({ bill, row }: BillStoryProps) {
  const explainer = await getApprovedExplainer(bill.id).catch(() => null);
  return (
    <>
      {explainer ? <ExplainerCard explainer={explainer} variant="bill" headingId="bill-explainer" /> : null}
      <BillJourney bill={bill} row={row} />
      <OpinionPoll billId={bill.id} officialUrl={bill.url} />
    </>
  );
}
