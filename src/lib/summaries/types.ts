/**
 * Plain-language bill explainers ("30 секундэд" + "Энэ танд хамаатай юу?").
 * Drafted by the AI model from the official LawForum text, then edited/approved by a person.
 * Only `status: "approved"` documents are ever shown publicly.
 */

export interface SourcePassage {
  ref: string; // "S3" — label the model saw
  anchor: string; // LawForum clause anchor, links to {billUrl}#{anchor}
  number: string; // "3.1" or ""
  article: string;
  text: string;
}

export interface SummaryPoint {
  text: string;
  refs: string[]; // SourcePassage.ref values
}

export interface ImpactPoint extends SummaryPoint {
  who: string; // short group label, e.g. "Иргэд", "Байгууллагууд"
}

export interface BillVideo {
  src: string; // "/api/videos/<file>" (uploaded) or an https YouTube/other link
  kind: "file" | "youtube" | "link";
  title: string | null;
}

export interface BillExplainer {
  billId: number;
  billTitle: string;
  billUrl: string;
  status: "draft" | "approved";
  summary: SummaryPoint[];
  impact: ImpactPoint[];
  sources: SourcePassage[];
  video: BillVideo | null;
  generatedAt: string | null;
  model: string | null;
  editedByReviewer: boolean;
  reviewedBy: string | null; // kept for the audit trail, not shown publicly
  approvedAt: string | null;
  updatedAt: string;
}
