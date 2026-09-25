import "server-only";
import { serverEnv } from "../env";
import { fetchJson, SourceError, ttlCache } from "../http";
import { cleanText, toLocalDate, todayLocal } from "../format";
import { officialUrl } from "../site";
import { getAllProposals } from "../sources/lawforum";
import { parliamentSite } from "../sources/parliamentSite";
import { normalizeProposal } from "../normalize/proposals";
import { normalizeMemberProfile } from "../normalize/members";
import { normalizeSchedule } from "../normalize/activity";
import { normalizeSessions } from "../normalize/sessions";
import { parseLawForumPage, type LawForumDocument } from "./lawforum-page.ts";
import type {
  BillRecord,
  BulletinBill,
  MemberDetail,
  MemberRecord,
  ParliamentData,
  PollRecord,
  ScheduleRecord,
  SessionRecord,
} from "./records.ts";

/**
 * Live, read-only access to official Parliament sources for Ask Parliament AI.
 * Reuses the homepage data clients where they exist; adds the three reads the assistant needs
 * (bill bulletin with stages, vote search, and LawForum bill pages).
 * Nothing here accepts a URL from the user or the model — every request URL is built from fixed bases.
 */

const SITE = "new.parliament.mn";
const api = (path: string) => `${serverEnv.parliamentSiteApiBaseUrl}/${path}`;

/* ------------------------------------------------------------------ LawForum */

const LAWFORUM_HOSTS = new Set(["lawforum.parliament.mn"]);
const MAX_PAGE_BYTES = 5_000_000;

/** Bounded LRU for parsed bill pages (pages are 1 MB+, too large for the Next data cache). */
const documentCache = new Map<number, { value: LawForumDocument | null; expires: number }>();
const DOCUMENT_TTL = 6 * 60 * 60 * 1000;

async function fetchBillDocument(bill: BillRecord): Promise<LawForumDocument | null> {
  const hit = documentCache.get(bill.id);
  if (hit && hit.expires > Date.now()) return hit.value;
  const url = new URL(bill.url);
  if (url.protocol !== "https:" || !LAWFORUM_HOSTS.has(url.hostname)) throw new SourceError("LawForum", undefined, "LawForum: unexpected host");
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "text/html" } });
  } catch {
    throw new SourceError("LawForum", undefined, "LawForum page: network error");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new SourceError("LawForum", res.status, `LawForum page: HTTP ${res.status}`);
  const html = await res.text();
  const value = html.length > MAX_PAGE_BYTES ? null : parseLawForumPage(html);
  documentCache.set(bill.id, { value, expires: Date.now() + DOCUMENT_TTL });
  if (documentCache.size > 60) documentCache.delete(documentCache.keys().next().value!);
  return value;
}

const billsCache = ttlCache<BillRecord[]>(30 * 60 * 1000);

function bills(): Promise<BillRecord[]> {
  return billsCache("bills", async () => {
    const today = todayLocal();
    return (await getAllProposals())
      .map((raw) => normalizeProposal(raw, [], today))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => ({
        id: p.id,
        title: p.title,
        projectNumber: p.projectNumber,
        typeId: p.typeId,
        typeTitle: p.typeTitle,
        categoryTitle: p.categoryTitle,
        stage: p.stage,
        publishedDate: p.publishedDate,
        year: p.year,
        url: p.sourceUrl,
      }));
  });
}

/* ------------------------------------------------------------------ Bulletin */

interface RawBulletinRow {
  id: number;
  bulletin_title: string;
  bulletin_snapshot_at: string;
  category_display: string | null;
  committee_name: string | null;
  title: string;
  initiator: string | null;
  initiator_date: string | null;
  working_group: string | null;
  stages: { order: number; stage_label: string | null; committee_meeting_note: string | null; plenary_meeting_note: string | null }[] | null;
}

async function bulletin(): Promise<BulletinBill[]> {
  const rows = await fetchJson<RawBulletinRow[]>(SITE, api("bills-public/"), { revalidate: 3600 });
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.id === "number" && row.title)
    .map((row) => ({
      id: row.id,
      title: cleanText(row.title),
      category: cleanText(row.category_display) || "Төсөл",
      committee: cleanText(row.committee_name) || null,
      initiator: cleanText(row.initiator) || null,
      submittedDate: /^\d{4}-\d{2}-\d{2}$/.test(row.initiator_date ?? "") ? row.initiator_date : null,
      workingGroup: cleanText(row.working_group) || null,
      stages: [...(row.stages ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ label: cleanText(s.stage_label), committeeNote: cleanText(s.committee_meeting_note), plenaryNote: cleanText(s.plenary_meeting_note) }))
        .filter((s) => s.label),
      snapshotDate: toLocalDate(row.bulletin_snapshot_at) ?? "",
      bulletinTitle: cleanText(row.bulletin_title),
      url: officialUrl.billBulletin(),
    }));
}

/* --------------------------------------------------------------------- Polls */

interface RawPoll {
  id: number;
  name: string;
  meeting_title?: string;
  meeting_date?: string;
  agenda_title?: string | null;
  total_for: number;
  total_against: number;
  total_voted: number;
  for_percentage?: number;
  against_percentage?: number;
  total_not_voted?: number;
  total_members?: number;
  result_label: string;
  meeting?: { title?: string; date?: string };
  agenda?: { title?: string } | null;
}

function normalizePoll(p: RawPoll): PollRecord | null {
  if (!p || typeof p.id !== "number" || !Number.isFinite(p.total_voted)) return null;
  const date = toLocalDate(p.meeting_date ?? p.meeting?.date ?? null);
  if (!date) return null;
  return {
    id: p.id,
    motion: cleanText(p.name).replace(/^\d+\s*[.)]\s*/, ""),
    agendaTitle: cleanText(p.agenda_title ?? p.agenda?.title).replace(/^[.:]\s*/, "") || null,
    meetingTitle: cleanText(p.meeting_title ?? p.meeting?.title) || "Хуралдаан",
    date,
    forCount: p.total_for,
    againstCount: p.total_against,
    totalVoted: p.total_voted,
    forPercent: Number.isFinite(p.for_percentage) ? p.for_percentage! : null,
    againstPercent: Number.isFinite(p.against_percentage) ? p.against_percentage! : null,
    notVoted: Number.isFinite(p.total_not_voted) ? p.total_not_voted! : null,
    totalMembers: Number.isFinite(p.total_members) ? p.total_members! : null,
    resultLabel: cleanText(p.result_label),
    url: officialUrl.vote(p.id),
  };
}

async function searchPolls(query: { search: string; from?: string; to?: string; limit: number }): Promise<PollRecord[]> {
  const params = new URLSearchParams({ page_size: String(Math.min(Math.max(query.limit, 1), 20)) });
  if (query.search) params.set("search", query.search.slice(0, 120));
  // The endpoint only filters reliably when both bounds are present.
  if (query.from && query.to) {
    params.set("date_from", query.from);
    params.set("date_to", query.to);
  }
  const page = await fetchJson<{ results?: RawPoll[] }>(SITE, api(`meeting/public-polls/?${params}`), { revalidate: 900, timeoutMs: 12_000 });
  return (page.results ?? []).map(normalizePoll).filter((p): p is PollRecord => p !== null);
}

async function poll(id: number): Promise<PollRecord | null> {
  try {
    return normalizePoll(await fetchJson<RawPoll>(SITE, api(`meeting/public-polls/${id}/`), { revalidate: 3600, timeoutMs: 10_000 }));
  } catch (error) {
    if (error instanceof SourceError && error.status === 404) return null;
    throw error;
  }
}

/* ------------------------------------------------------------------- Members */

const membersCache = ttlCache<MemberRecord[]>(60 * 60 * 1000);

function members(): Promise<MemberRecord[]> {
  return membersCache("members", async () => {
    const raw = await parliamentSite.membersList();
    return (raw.members ?? [])
      .filter((m) => m && typeof m.id === "number" && m.first_name)
      .map((m) => {
        const firstName = cleanText(m.first_name);
        const lastName = cleanText(m.last_name);
        const positions = (m.positions ?? []).map((p) => ({ unitId: p.unit_id, unit: cleanText(p.unit_name), unitType: p.unit_type, title: cleanText(p.name) }));
        const parliamentRole = positions.find((p) => p.unitType === "PARLIAMENT" && p.title !== "Гишүүн");
        return {
          id: m.id,
          firstName,
          lastName,
          shortName: lastName ? `${lastName.charAt(0)}.${firstName}` : firstName,
          party: cleanText(m.party?.name) || null,
          role: parliamentRole ? `УИХ-ын ${parliamentRole.title.toLowerCase()}` : null,
          positions,
          url: officialUrl.member(m.id),
        };
      });
  });
}

async function memberDetail(id: number): Promise<MemberDetail | null> {
  try {
    const [detail, attendance] = await Promise.all([
      parliamentSite.memberDetail(id),
      parliamentSite.memberAttendance(id).catch(() => null),
    ]);
    const profile = normalizeMemberProfile(detail, attendance);
    return {
      id: profile.id,
      fullName: profile.fullName,
      constituency: profile.constituency?.name ?? null,
      electionSystem: profile.constituency?.system ?? null,
      electionName: profile.constituency?.electionName ?? null,
      positions: profile.positions.map((p) => ({ unit: p.unitName, unitType: p.unitType, title: p.title })),
      attendance: profile.attendance
        ? { percentage: profile.attendance.percentage, present: profile.attendance.present, total: profile.attendance.total, scope: profile.attendance.scopeLabel }
        : null,
      url: profile.sourceUrl,
    };
  } catch (error) {
    if (error instanceof SourceError && error.status === 404) return null;
    throw error;
  }
}

/* ------------------------------------------------------- Schedule & sessions */

async function schedule(): Promise<ScheduleRecord | null> {
  const week = normalizeSchedule(await parliamentSite.latestSchedule());
  if (!week) return null;
  const fileUrl = week.fileUrl && /^https:\/\/new\.parliament\.mn\//.test(week.fileUrl) ? week.fileUrl : officialUrl.home();
  return {
    title: week.title,
    startDate: week.startDate,
    endDate: week.endDate,
    url: fileUrl,
    events: week.days.flatMap((day) =>
      day.events.map((e) => ({ date: day.date, weekday: day.weekday, time: e.time, kind: e.kind, title: e.title, agendaItems: e.agendaItems })),
    ),
  };
}

async function sessions(): Promise<SessionRecord[]> {
  const raw = await parliamentSite.attendanceOverview();
  return normalizeSessions(raw.sessions).map((s) => ({
    key: s.key,
    label: s.label,
    startDate: s.startDate,
    endDate: s.endDate,
    meetingCount: s.meetingCount,
    url: officialUrl.plenaryMeetings(),
  }));
}

export const parliamentData: ParliamentData = {
  bills,
  billDocument: fetchBillDocument,
  bulletin,
  searchPolls,
  poll,
  members,
  memberDetail,
  schedule,
  sessions,
  today: todayLocal,
};
