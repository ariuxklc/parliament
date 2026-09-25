/**
 * Submitted legislative projects ("Өргөн мэдүүлсэн төслүүд") — browser-safe types.
 *
 * Source: the JSON backend of d.parliament.mn (ЦАХИМ ПАРЛАМЕНТ), see ./dparliament.ts.
 * Only fields whose meaning is verified are exposed. Deliberately NOT exposed:
 *  - `jdata.step` — a hand-set stage label that often disagrees with the official bill bulletin;
 *  - `status`, `priority`, read/like counters — undocumented or not meaningful to citizens.
 */

export type ProjectFileType = "pdf" | "docx" | "doc" | "xlsx" | "image" | "other";

/** Official initiator categories from d.parliament.mn (`/content/tree?type=TSAN_CAT`). */
export type InitiatorGroup = "Засгийн газар" | "УИХ-ын гишүүд" | "Ерөнхийлөгч" | "Бусад";

export interface ProjectInitiator {
  /** Display name: organisations verbatim, members as "Б.Уянга". */
  name: string;
  /** Role label published with the initiator, e.g. "УИХ-ын гишүүн"; null when blank. */
  role: string | null;
  group: InitiatorGroup | null;
}

/** One official attachment, exactly as published in the project's metadata. */
export interface ProjectDocument {
  /** LawForum file id — the stable identity of the file (same id on lawforum.parliament.mn). */
  fileId: number;
  /** Official category id (LawForum "ProjectPartCategory"), e.g. "1" = Үзэл баримтлал. */
  categoryId: string;
  /** Full official category title, e.g. "Өргөн мэдүүлэх -Үзэл баримтлал". */
  categoryTitle: string;
  /** Procedure step the category belongs to, e.g. "Өргөн мэдүүлэх" (text before " -"). */
  step: string;
  /** Category name without the step prefix, e.g. "Үзэл баримтлал". */
  category: string;
  filename: string;
  /** Optional title published with the file (usually null). */
  title: string | null;
  fileType: ProjectFileType;
  /** MIME type as published (not trusted for parsing — files are sniffed before extraction). */
  mime: string | null;
  /** Official URL exactly as published (downloads the file). */
  officialUrl: string;
  /** Same official file without the download flag — PDFs open in the browser's viewer. */
  viewUrl: string;
}

export interface SubmittedProject {
  /** d.parliament.mn content id (UUID). */
  id: string;
  /** Official title, verbatim (titles are published in upper case). */
  title: string;
  /** Official document type, e.g. "Монгол Улсын хууль", "Улсын Их Хурлын тогтоол". */
  type: string | null;
  /**
   * The date d.parliament.mn prints on the project (YYYY-MM-DD, Ulaanbaatar). Usually within 1–2 days of the
   * formal submission date in the Parliament bill bulletin, so it is labelled as the project's date, not as
   * "submitted on".
   */
  date: string | null;
  year: number | null;
  initiator: ProjectInitiator | null;
  /** Number of additional initiators listed with the project (details: /content/tusulTeam). */
  coInitiatorCount: number;
  documents: ProjectDocument[];
  /** Official project page on d.parliament.mn. */
  officialUrl: string;
}

/** Compact row for the listing page (keeps the client payload small). */
export interface ProjectListItem {
  id: string;
  title: string;
  type: string | null;
  date: string | null;
  year: number | null;
  initiator: string | null;
  initiatorGroup: InitiatorGroup | null;
  coInitiatorCount: number;
  documentCount: number;
  /** Categories present (short names, submission step first) — shown as a hint of what can be read. */
  categories: string[];
  hasBrief: boolean;
  /** First sentence(s) of the AI brief, when one has been generated. */
  briefLead: string | null;
  officialUrl: string;
}

export interface ProjectCatalogMeta {
  total: number;
  fetchedAt: string;
  /** True when the live source failed and the last saved copy is shown. */
  stale: boolean;
}

/** Order in which procedure steps are shown (official sequence; unknown steps follow in order of appearance). */
export const STEP_ORDER = [
  "Өргөн мэдүүлэх",
  "Хэлэлцэх эсэх",
  "Анхны хэлэлцүүлэг",
  "Эцсийн хэлэлцүүлэг",
  "Эцэслэн батлах",
  "Эцсийн найруулга",
  "Ёсчлох",
];
