/**
 * AI project briefs for submitted projects — browser-safe types.
 *
 * A brief is written offline (scripts/process-projects.ts) from the project's official attachments and
 * cached in data/project-summaries/<projectId>.json. The model is not a source: every statement carries
 * excerpt ids (e.g. "D2.3") that the server resolves to an official file it downloaded itself.
 */

export const BRIEF_SCHEMA_VERSION = 1;

export type DocRole = "draft" | "concept" | "introduction" | "needs" | "impact" | "cost" | "related" | "discussion" | "letter" | "other";

export interface BriefStatement {
  text: string;
  /** Excerpt ids ("D1.2"); resolved through `excerpts` → `sources`. */
  refs: string[];
}

export interface AffectedStatement extends BriefStatement {
  /** Short group name, e.g. "Иргэд", "Уул уурхайн компаниуд". */
  who: string;
}

/** A document the model was given (server-owned provenance). */
export interface BriefSourceDoc {
  ref: string; // "D1"
  fileId: number;
  role: DocRole;
  /** Short label for chips, e.g. "Хуулийн төсөл", "Үзэл баримтлал". */
  label: string;
  category: string;
  step: string;
  filename: string;
  fileType: string;
  officialUrl: string;
  viewUrl: string;
  sha256: string;
  extraction: "native" | "ocr";
  pages: number | null;
  chars: number;
}

export interface BriefExcerpt {
  id: string; // "D1.2"
  docRef: string; // "D1"
  heading: string | null;
  page: number | null;
  text: string;
}

export interface SkippedDoc {
  fileId: number;
  filename: string;
  category: string;
  reason: "needs-ocr" | "unsupported" | "failed" | "too-large" | "not-relevant";
  note: string | null;
}

export interface ProjectBrief {
  schemaVersion: number;
  projectId: string;
  projectTitle: string;
  /** Official project page on d.parliament.mn. */
  projectUrl: string;
  lawforumId: number | null;
  /** Generated automatically; not reviewed by a person. */
  status: "ai";
  /** "Товч агуулга" — 2–4 sentences. */
  summary: BriefStatement[];
  /** "Гол өөрчлөлтүүд" — 3–7 items when the documents support them. */
  mainChanges: BriefStatement[];
  /** "Яагаад өргөн мэдүүлсэн бэ?" — empty when the documents do not state it. */
  statedRationale: BriefStatement[];
  /** "Хэнд / юунд хамаарах вэ?" */
  affectedAreas: AffectedStatement[];
  /** "Анхаарах гол зүйлс" */
  keyPoints: BriefStatement[];
  /** Documents the model saw, in the order it saw them. */
  sources: BriefSourceDoc[];
  /** Only the excerpts that statements cite (shown for verification). */
  excerpts: BriefExcerpt[];
  /** Official files that could not be read (e.g. scans) — listed so readers know what the brief did not cover. */
  skipped: SkippedDoc[];
  /** Every official file id at generation time; the page flags the brief when the project's files change. */
  documentFileIds: number[];
  /** sha256 of project id + source hashes + schema/prompt version + model. */
  cacheKey: string;
  model: string;
  promptVersion: number;
  generatedAt: string;
}

export const SECTION_TITLES = {
  summary: "Товч агуулга",
  mainChanges: "Гол өөрчлөлтүүд",
  statedRationale: "Яагаад өргөн мэдүүлсэн бэ?",
  affectedAreas: "Хэнд / юунд хамаарах вэ?",
  keyPoints: "Анхаарах гол зүйлс",
} as const;
