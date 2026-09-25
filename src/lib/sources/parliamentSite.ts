import "server-only";
import { serverEnv } from "../env";
import { fetchJson, fetchText } from "../http";

/**
 * Public JSON API behind new.parliament.mn (the official site's own SPA backend, no auth).
 * Endpoints were identified from the site's network traffic on 2026-09-25. All are GET.
 * Anything answering 401 without credentials (e.g. /law/bills/, /election/*) is intentionally not used.
 */

const api = (path: string) => `${serverEnv.parliamentSiteApiBaseUrl}/${path}`;
const SRC = "new.parliament.mn";

/* ---------- raw payload types (only the fields we read) ---------- */

export interface RawParty { id: number; name: string; logo: string | null; display_order?: number }
export interface RawMemberPosition {
  id: number; position_id?: number; name: string; unit_id: number; unit_name: string; unit_type: string;
  start_date: string | null; end_date: string | null;
}
export interface RawMemberListItem {
  id: number; first_name: string; last_name: string; profile_image: string | null;
  party: RawParty | null; positions: RawMemberPosition[];
}
export interface RawMembersList {
  members: RawMemberListItem[];
  filters: { parties: RawParty[]; committees: { id: number; name: string; display_order: number }[]; subcommittees?: unknown[] };
}

export interface RawMemberDetail {
  id: number; first_name: string; last_name: string; full_name: string; short_name: string;
  profile_image: string | null; cover_image: string | null; party: RawParty | null; is_active: boolean;
  current_positions: {
    id: number; position_name: string; unit: number; unit_name: string; unit_type: string; is_current: boolean;
  }[];
  election_results: {
    constituency: number | null; constituency_name: string | null; constituency_number: number | null;
    election_name: string | null; election_date: string | null; election_system: string | null;
    election_system_display: string | null; nominated_by_name: string | null;
  }[];
}

export interface RawAttendanceSession { key: string; label: string; start_date?: string; end_date?: string; meeting_count: number }
export interface RawAttendanceMember {
  member: { id: number };
  sessions: RawAttendanceSession[];
  total_meeting_count: number;
  summary: Record<string, number>; // percentage, present, total, on_time, late, leave, medical_leave, foreign_trip, local_trip, absent, other
  meetings: { id: number; date: string; status: string; status_label: string }[];
}

export interface RawAttendanceOverview {
  sessions: Required<RawAttendanceSession>[];
  summary: { average_attendance: number; total_members: number; party_count: number };
}

export interface RawMembersStatistics {
  total_members: number;
  party: { party_id: number; party_name: string; count: number }[];
  sex: { sex: string; label: string; count: number }[];
  election: { elected_count: number; label: string; count: number }[];
}

export interface RawLatestMeetings {
  plenary: {
    id: number; title: string; short_description: string; date: string; location: string | null;
  } | null;
  committee: unknown;
}

export interface RawLiveVideo {
  live_meeting: unknown;
  video: { id: number; title: string; date: string; video_url: string; is_live: boolean } | null;
}

export interface RawSchedule {
  id: number; title: string; file_url: string | null; start_date: string; end_date: string; status: string;
  data: {
    days: {
      date: string; weekday: string;
      sections: { name: string; type: string; events: { time: string | null; room: string | null; type: string; title: string; agenda_items?: string[]; meeting?: string }[] }[];
    }[];
  } | null;
}

export interface RawNewsItem {
  id: number; category_name: string | null; title: string; slug: string; cover_image: string | null;
  short_description: string | null; is_featured?: boolean; published_at: string; status?: string;
}
interface RawNewsPage { count: number; results: RawNewsItem[] }

export interface RawBill {
  id: number; bulletin_title: string; bulletin_snapshot_at: string; category_display: string;
  committee_name: string | null; title: string;
}

export interface RawPoll {
  id: number; name: string; meeting_title: string; meeting_date: string; agenda_title: string | null;
  total_for: number; total_against: number; total_voted: number; result_key: string; result_label: string;
}
interface RawPollPage { count: number; results: RawPoll[] }

export interface RawUnit {
  id: number;
  name: string;
  unit_type: string;
  icon: string | null;
  display_order: number;
}

export interface RawMenuItem {
  id: number; label: string; link_type: string; external_url: string | null; linked_news_slug: string | null; target: string;
  sub?: RawMenuItem[];
}

/* ---------- loaders ---------- */

const HOUR = 3600;

export const parliamentSite = {
  membersList: () => fetchJson<RawMembersList>(SRC, api("parliament_members_list/"), { revalidate: 6 * HOUR }),
  memberDetail: (id: number) => fetchJson<RawMemberDetail>(SRC, api(`parliament_member/detail/${id}/`), { revalidate: 6 * HOUR, timeoutMs: 8_000 }),
  memberAttendance: (id: number) => fetchJson<RawAttendanceMember>(SRC, api(`meeting/attendance_members/${id}/`), { revalidate: HOUR, timeoutMs: 8_000 }),
  membersStatistics: () => fetchJson<RawMembersStatistics>(SRC, api("members/statistics/"), { revalidate: 6 * HOUR }),
  attendanceOverview: () => fetchJson<RawAttendanceOverview>(SRC, api("meeting/attendance_overview/"), { revalidate: HOUR, timeoutMs: 12_000 }),
  latestMeetings: () => fetchJson<RawLatestMeetings>(SRC, api("meeting/public/latest-meetings/"), { revalidate: 300 }),
  liveVideo: () => fetchJson<RawLiveVideo>(SRC, api("meeting/public/live-video/"), { revalidate: 60 }),
  latestSchedule: () => fetchJson<RawSchedule>(SRC, api("parliament/schedules/latest/"), { revalidate: 1800 }),
  featuredNews: () => fetchJson<RawNewsItem[]>(SRC, api("featured-news/"), { revalidate: 600 }),
  /** The article list endpoint is slow (10 s+ at times) — callers must tolerate failure. */
  latestNews: (pageSize: number) =>
    fetchJson<RawNewsPage>(SRC, api(`news/articles/?page_size=${pageSize}`), { revalidate: 600, timeoutMs: 12_000 }),
  billBulletin: () => fetchJson<RawBill[]>(SRC, api("bills-public/"), { revalidate: HOUR }),
  latestPolls: (pageSize: number) => fetchJson<RawPollPage>(SRC, api(`meeting/public-polls/?page_size=${pageSize}`), { revalidate: 900 }),
  headerMenu: () => fetchJson<RawMenuItem[]>(SRC, api("menu/header/"), { revalidate: 24 * HOUR }),
  committees: () => fetchJson<RawUnit[]>(SRC, api("parliament/units/?unit_type=COMMITTEE"), { revalidate: 24 * HOUR }),
  /**
   * Public petitions, "most supported" order — the same HTML feed the official homepage embeds
   * (petition.parliament.mn has no JSON API). Parsed in normalize/petitions.ts.
   */
  petitionsHtml: () =>
    fetchText("petition.parliament.mn", `${serverEnv.parliamentSiteApiBaseUrl.replace(/\/api$/, "")}/petition-source/Index?pageindex=1`, { revalidate: 900, timeoutMs: 12_000 }),
};
