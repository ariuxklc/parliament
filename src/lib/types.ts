/**
 * Normalized domain model used by homepage components.
 *
 * Components never read raw API payloads — they receive these types from `src/lib/normalize/*`.
 * Every entity keeps a `sourceUrl` so the UI can always link back to the official record.
 */

/** Result wrapper so each section can degrade independently when one source is down. */
export type Loaded<T> =
  | { ok: true; data: T; fetchedAt: string }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ Sessions */

export type SessionKind = "spring" | "fall" | "irregular" | "other";

/**
 * An official parliamentary session (чуулган).
 * Source: new.parliament.mn `/api/meeting/attendance_overview/` → `sessions[]`.
 * `startDate` / `endDate` are the first and last plenary meeting dates recorded for the session.
 */
export interface ParliamentSession {
  key: string; // e.g. "2026-fall", "2026-irregular-2026-09-07"
  label: string; // official label, e.g. "2026 оны Намрын ээлжит чуулган"
  year: number;
  kind: SessionKind;
  startDate: string; // YYYY-MM-DD (Ulaanbaatar)
  endDate: string; // YYYY-MM-DD (Ulaanbaatar)
  meetingCount: number; // plenary meetings recorded so far
  /** True when this is the most recent session and it had a meeting recently — treated as still running. */
  isOpen: boolean;
}

/* ----------------------------------------------------------------- Proposals */

/**
 * LawForum lifecycle position. Verified against lawforum.parliament.mn on 2026-09-25:
 *  - stage 0  → listed under "Боловсруулж буй төслүүд", URL /draft/{id}/, label "Санал авч байна"
 *  - stage 10 → listed under "Өргөн мэдүүлсэн төслүүд", URL /project/{id}/, label "Нийтэлсэн"
 */
export type ProposalStage = "drafting" | "submitted";

export interface Proposal {
  id: number;
  title: string;
  projectNumber: string | null;
  typeId: number;
  typeTitle: string; // "Монгол Улсын хууль", "Улсын Их Хурлын тогтоол", …
  categoryTitle: string | null; // "Бие даасан", "Нэмэлт өөрчлөлт", …
  stage: ProposalStage;
  /** Local (Asia/Ulaanbaatar) publication date on LawForum, YYYY-MM-DD. */
  publishedDate: string;
  year: number;
  /** Official session whose date window contains `publishedDate`, if any. */
  sessionKey: string | null;
  /** Only present after detail enrichment (LawForum detail endpoint). ISO string. */
  updatedAt?: string | null;
  sourceUrl: string;
  /**
   * Unused on list cards for now — AI explainers live on the bill page (src/lib/summaries), labeled as
   * AI-generated with clause citations.
   */
  summary?: { text: string; reviewedBy: string; reviewedAt: string } | null;
}

export type ProposalSort = "newest" | "oldest" | "updated";
export type ProposalStageFilter = "all" | ProposalStage;

export interface ProposalQuery {
  year: number;
  session: string | null; // session key or null = whole year
  stage: ProposalStageFilter;
  typeId: number | null;
  sort: ProposalSort;
  q: string;
  limit: number;
}

export interface YearBucket {
  year: number;
  count: number;
}

export interface PeriodSummary {
  total: number;
  drafting: number;
  submitted: number;
  byType: { typeId: number; typeTitle: string; count: number }[];
}

export interface PlenaryAgendaItem {
  code: string;
  title: string;
}

export interface ProposalsResponse {
  query: ProposalQuery;
  years: YearBucket[];
  sessions: ParliamentSession[]; // sessions belonging to query.year
  /** Proposals published inside each session's window (key → count). */
  sessionCounts: Record<string, number>;
  /** Counts inside the selected period before stage/type/search filters. */
  period: PeriodSummary;
  /** Number of results after all filters. */
  matched: number;
  items: Proposal[];
  /** Plenary agenda (Parliament API) for the period — null when the source has no data for it. */
  agenda: { total: number; items: PlenaryAgendaItem[]; sessionCodes: string[] } | null;
  notes: string[];
}

/* ------------------------------------------------------------------- Members */

export interface Party {
  id: number;
  name: string;
  logo: string | null;
  /** Colour sampled from the party's official logo (see `PARTY_COLORS`). */
  color: string;
}

export interface MemberPosition {
  unitId: number;
  unitName: string;
  unitType: "PARLIAMENT" | "COMMITTEE" | "SUBCOMMITTEE" | "TEMPORARY_COMMITTEE" | string;
  title: string; // "Гишүүн", "Дарга", "Дэд дарга"
}

export interface MemberSummary {
  id: number;
  firstName: string;
  lastName: string;
  shortName: string; // official "Ж.Алдаржавхлан" format
  portrait: string | null;
  party: Party | null;
  /** Highest-ranking role, e.g. "УИХ-ын дарга" or "Төсвийн байнгын хорооны дарга". */
  role: string | null;
  /** Compact form for small cards, e.g. "Байнгын хорооны дарга". */
  roleShort: string | null;
  leadershipRank: number; // 0 = Speaker, 1 = Deputy Speaker, 2 = committee chair, 9 = member
  committees: string[];
  committeeIds: number[];
  sourceUrl: string;
}

export interface MemberRoster {
  members: MemberSummary[];
  parties: (Party & { count: number })[];
  committees: { id: number; name: string }[];
}

export interface AttendanceBreakdownItem {
  key: string;
  label: string; // official status label
  count: number;
}

export interface MemberProfile {
  id: number;
  fullName: string;
  shortName: string;
  portrait: string | null;
  cover: string | null;
  party: Party | null;
  constituency: {
    name: string | null;
    number: number | null;
    system: string | null; // official display, e.g. "Тойрог (Мажоритар - 78)"
    electionName: string | null;
  } | null;
  positions: MemberPosition[];
  attendance: {
    percentage: number;
    present: number;
    total: number;
    breakdown: AttendanceBreakdownItem[];
    scopeLabel: string; // e.g. "2024 оны Намрын ээлжит чуулганаас хойш"
  } | null;
  sourceUrl: string;
}

/* ---------------------------------------------------------------- Activity */

export interface CurrentSessionInfo {
  session: ParliamentSession | null;
  latestPlenary: {
    id: number;
    title: string;
    description: string;
    date: string; // ISO
    location: string | null;
    sourceUrl: string;
  } | null;
  live: { isLive: boolean; title: string; date: string; videoUrl: string } | null;
}

export interface ScheduleEvent {
  time: string | null;
  room: string | null;
  title: string;
  kind: "PLENARY" | "COMMITTEE" | "WORKING_GROUP" | "OTHER";
  agendaItems: string[];
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  weekday: string; // official label from the schedule
  events: ScheduleEvent[];
}

export interface WeeklySchedule {
  title: string;
  startDate: string;
  endDate: string;
  days: ScheduleDay[];
  fileUrl: string | null;
}

export interface VoteSummary {
  id: number;
  motion: string;
  agendaTitle: string | null;
  meetingTitle: string;
  date: string; // ISO
  forCount: number;
  againstCount: number;
  totalVoted: number;
  resultLabel: string; // official, e.g. "Зөвшөөрсөн"
  resultKey: string;
  sourceUrl: string;
}

export interface BillBulletinSummary {
  title: string;
  snapshotAt: string; // ISO
  total: number;
  byCategory: { label: string; count: number }[];
  byCommittee: { label: string; count: number }[];
  sourceUrl: string;
}

/* --------------------------------------------------------------------- News */

export interface NewsItem {
  id: number;
  title: string;
  category: string | null;
  excerpt: string | null;
  cover: string | null;
  publishedAt: string; // ISO
  featured: boolean;
  sourceUrl: string;
}

/* -------------------------------------------------------------------- Stats */

export interface ParliamentComposition {
  totalMembers: number;
  parties: { party: Party; seats: number }[];
  sex: { label: string; count: number }[];
  firstTermCount: number | null;
  termBreakdown: { label: string; count: number }[];
}

export interface AttendanceOverviewStat {
  averagePercentage: number;
  meetingCount: number;
  firstSessionLabel: string | null;
  lastMeetingDate: string | null;
}

export interface NavItem {
  label: string;
  href: string;
  external: boolean;
  children: { label: string; href: string; external: boolean }[];
}
