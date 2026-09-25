/**
 * Normalized official records used by Ask Parliament AI retrieval, plus the data-access contract.
 *
 * Retrieval code depends only on `ParliamentData`, so the real server implementation
 * (`./data.ts`, server-only) can be swapped for fixtures in tests. Every record carries
 * the official URL it came from — URLs are built by the server, never by the model.
 */
import type { LawForumDocument } from "./lawforum-page.ts";

/** LawForum project (API list item + the listing section it appears in on lawforum.parliament.mn). */
export interface BillRecord {
  id: number;
  title: string;
  projectNumber: string | null;
  typeId: number;
  typeTitle: string;
  categoryTitle: string | null;
  /** Verified listing: stage 0 → "Боловсруулж буй төслүүд" (/draft/), stage 10 → "Өргөн мэдүүлсэн төслүүд" (/project/). */
  stage: "drafting" | "submitted";
  /** Date LawForum shows for the record (Ulaanbaatar time). Not the formal submission date. */
  publishedDate: string;
  year: number;
  url: string;
}

/** One row of the official bill bulletin on new.parliament.mn/bill-bulletin (bills in Parliament deliberation). */
export interface BulletinBill {
  id: number;
  title: string;
  category: string; // official label, e.g. "Хуулийн төсөл"
  committee: string | null;
  initiator: string | null;
  /** Official submission date as printed in the bulletin (YYYY-MM-DD), when present. */
  submittedDate: string | null;
  workingGroup: string | null;
  stages: { label: string; committeeNote: string; plenaryNote: string }[];
  snapshotDate: string; // YYYY-MM-DD the bulletin was compiled
  bulletinTitle: string;
  url: string;
}

export interface PollRecord {
  id: number;
  motion: string;
  agendaTitle: string | null;
  meetingTitle: string;
  date: string; // YYYY-MM-DD (Ulaanbaatar)
  forCount: number;
  againstCount: number;
  totalVoted: number;
  forPercent: number | null;
  againstPercent: number | null;
  notVoted: number | null;
  totalMembers: number | null;
  resultLabel: string;
  url: string;
}

export interface MemberRecord {
  id: number;
  firstName: string;
  lastName: string;
  shortName: string;
  party: string | null;
  role: string | null;
  /** Current positions from the official member list. */
  positions: { unitId: number; unit: string; unitType: string; title: string }[];
  url: string;
}

export interface MemberDetail {
  id: number;
  fullName: string;
  constituency: string | null;
  electionSystem: string | null;
  electionName: string | null;
  positions: { unit: string; unitType: string; title: string }[];
  attendance: { percentage: number; present: number; total: number; scope: string } | null;
  url: string;
}

export interface ScheduleEventRecord {
  date: string;
  weekday: string;
  time: string | null;
  kind: string;
  title: string;
  agendaItems: string[];
}

export interface ScheduleRecord {
  title: string;
  startDate: string;
  endDate: string;
  events: ScheduleEventRecord[];
  url: string;
}

export interface SessionRecord {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  meetingCount: number;
  url: string;
}

export interface ParliamentData {
  /** Publicly listed LawForum records (≈1,000, cached). */
  bills(): Promise<BillRecord[]>;
  /** Parsed public LawForum page for one bill; null when it has no parsable text. */
  billDocument(bill: BillRecord): Promise<LawForumDocument | null>;
  bulletin(): Promise<BulletinBill[]>;
  searchPolls(query: { search: string; from?: string; to?: string; limit: number }): Promise<PollRecord[]>;
  poll(id: number): Promise<PollRecord | null>;
  members(): Promise<MemberRecord[]>;
  memberDetail(id: number): Promise<MemberDetail | null>;
  schedule(): Promise<ScheduleRecord | null>;
  sessions(): Promise<SessionRecord[]>;
  today(): string; // YYYY-MM-DD, Ulaanbaatar
}
