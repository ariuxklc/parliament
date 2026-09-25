/**
 * Plain-language bill explainers ("30 секундын AI тайлбар": summary + "Энэ танд хамаатай юу?").
 * Generated automatically by the AI model from the official LawForum text the first time a bill page is
 * opened, then cached. Shown with an "AI · хүн хянаагүй" label; every statement links to its clause.
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
  src: string; // "/videos/<billId>.mp4" (file in public/videos) or an https YouTube/other link
  kind: "file" | "youtube" | "link";
  title: string | null;
}

export interface BillExplainer {
  billId: number;
  billTitle: string;
  billUrl: string;
  /** "ai" = generated automatically, not checked by a person. "approved" = a person checked it (optional). */
  status: "ai" | "approved";
  summary: SummaryPoint[];
  impact: ImpactPoint[];
  sources: SourcePassage[];
  /** Resolved at read time from public/videos or data/videos.json — not stored with the summary. */
  video: BillVideo | null;
  generatedAt: string | null;
  model: string | null;
  approvedAt: string | null;
  updatedAt: string;
}
