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
import { parseLawPage, parseLawSearch } from "./legalinfo.ts";
import { parseRegister, REGISTER_BASE } from "./register.ts";
import type {
  BillRecord,
  BulletinBill,
  LawDocument,
  LawSearchHit,
  LawSearchQuery,
  MeetingDetail,
  MeetingRef,
  MemberDetail,
  MemberRecord,
  ParliamentData,
  PollRecord,
  ScheduleRecord,
  SessionRecord,
  SiteSearchHit,
  TranscriptEntry,
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

async function searchPolls(query: { search: string; from?: string; to?: string; limit: number; meetingId?: number }): Promise<PollRecord[]> {
  const params = new URLSearchParams({ page_size: String(Math.min(Math.max(query.limit, 1), 30)) });
  if (query.search) params.set("search", query.search.slice(0, 120));
  if (query.meetingId) params.set("meeting", String(query.meetingId));
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

/* --------------------------------------------------- legalinfo.mn (laws in force) */

const LEGALINFO = "https://legalinfo.mn";
const LEGALINFO_SRC = "legalinfo.mn";
const MAX_LAW_BYTES = 12_000_000;

/** legalinfo.mn's search endpoints need the session cookie its search page sets. */
let legalinfoSession: { cookie: string; expires: number } | null = null;
async function legalinfoCookie(refresh = false): Promise<string> {
  if (!refresh && legalinfoSession && legalinfoSession.expires > Date.now()) return legalinfoSession.cookie;
  const res = await fetch(`${LEGALINFO}/mn/advsearch`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  await res.text();
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  legalinfoSession = { cookie, expires: Date.now() + 20 * 60 * 1000 };
  return cookie;
}

/** legalinfo.mn full-text search takes several seconds; identical searches within 30 minutes are shared. */
const lawSearchCache = ttlCache<LawSearchHit[]>(30 * 60 * 1000);

function lawSearch(q: LawSearchQuery): Promise<LawSearchHit[]> {
  const key = JSON.stringify([q.query.toLocaleLowerCase("mn"), q.mode, q.category ?? "", !!q.inForceOnly, q.adoptedFrom ?? "", q.adoptedTo ?? ""]);
  return lawSearchCache(key, () => fetchLawSearch(q));
}

async function fetchLawSearch(q: LawSearchQuery): Promise<LawSearchHit[]> {
  const body = new URLSearchParams({
    title: q.query.slice(0, 120),
    leave_word: "",
    category_id: q.category ?? "",
    is_active: q.inForceOnly ? "1" : "",
    word_structure: "word_all",
    word_field: q.mode === "title" ? "only_title" : "all",
    b_date_start: q.adoptedFrom ?? "",
    b_date_end: q.adoptedTo ?? "",
    d_date_start: "",
    d_date_end: "",
  });
  const url = `${LEGALINFO}/mn/${q.mode === "title" ? "advsearchList" : "advsearchList/5"}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await legalinfoCookie(attempt > 0);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${LEGALINFO}/mn/advsearch`,
          Accept: "application/json",
        },
        body,
      });
    } catch {
      throw new SourceError(LEGALINFO_SRC, undefined, "legalinfo.mn: network error");
    }
    const text = await res.text();
    if (res.ok && text.startsWith("{")) {
      const html = (JSON.parse(text) as { Html?: string }).Html ?? "";
      return parseLawSearch(html);
    }
    // An expired session answers with an error page: the next attempt refreshes the cookie.
    if (attempt === 1) throw new SourceError(LEGALINFO_SRC, res.status, `legalinfo.mn search: HTTP ${res.status}`);
  }
  return [];
}

const lawCache = new Map<string, { value: LawDocument | null; expires: number }>();
const lawInflight = new Map<string, Promise<LawDocument | null>>();

/** Parallel tool calls often ask for the same law: share one download (pages are several MB). */
function lawDocument(lawId: string): Promise<LawDocument | null> {
  if (!/^\d{1,20}$/.test(lawId)) return Promise.resolve(null);
  const hit = lawCache.get(lawId);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  const running = lawInflight.get(lawId);
  if (running) return running;
  const promise = fetchLawDocument(lawId).finally(() => lawInflight.delete(lawId));
  lawInflight.set(lawId, promise);
  return promise;
}

async function fetchLawDocument(lawId: string): Promise<LawDocument | null> {
  let res: Response;
  try {
    res = await fetch(`${LEGALINFO}/mn/detail?lawId=${lawId}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
  } catch {
    throw new SourceError(LEGALINFO_SRC, undefined, "legalinfo.mn: network error");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new SourceError(LEGALINFO_SRC, res.status, `legalinfo.mn law: HTTP ${res.status}`);
  const html = await res.text();
  const doc = html.length > MAX_LAW_BYTES ? null : parseLawPage(html);
  const value = doc && (doc.articles.length || doc.loose.length) ? doc : null;
  lawCache.set(lawId, { value, expires: Date.now() + 6 * 60 * 60 * 1000 });
  if (lawCache.size > 12) lawCache.delete(lawCache.keys().next().value!);
  return value;
}

/* ------------------------------------------- www.parliament.mn register of passed acts */

async function passedActs(q: { keywords?: string; type?: "law" | "resolution" | "any"; sort?: "newest" | "oldest"; page?: number }) {
  const params = new URLSearchParams();
  if (q.keywords) params.set("keywords", q.keywords.slice(0, 100));
  if (q.type === "law") params.set("tid", "1");
  if (q.type === "resolution") params.set("tid", "2");
  params.set("sort", q.sort === "oldest" ? "ConfirmedOnAscending" : "ConfirmedOnDescending");
  if (q.page && q.page > 1) params.set("page", String(Math.min(q.page, 400)));
  let res: Response;
  try {
    res = await fetch(`${REGISTER_BASE}/laws/?${params}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new SourceError("parliament.mn", undefined, "parliament.mn register: network error");
  }
  if (!res.ok) throw new SourceError("parliament.mn", res.status, `parliament.mn register: HTTP ${res.status}`);
  return parseRegister(await res.text());
}

/* --------------------------------------------------------- meetings & transcripts */

interface RawMeetingOption { id: number; name: string; date: string }

const meetingsCache = ttlCache<MeetingRef[]>(30 * 60 * 1000);

/** Every plenary meeting with recorded votes (the votes endpoint lists them all, 2025-03 onward). */
function meetingsIndex(): Promise<MeetingRef[]> {
  return meetingsCache("all", async () => {
    const page = await fetchJson<{ filter_options?: { meetings?: RawMeetingOption[] } }>(SITE, api("meeting/public-polls/?page_size=1"), { revalidate: 1800 });
    return (page.filter_options?.meetings ?? [])
      .filter((m) => typeof m.id === "number")
      .map((m) => ({ id: m.id, title: cleanText(m.name), date: toLocalDate(m.date) ?? m.date.slice(0, 10), url: officialUrl.meeting(m.id) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  });
}

interface RawMeetingDetail {
  id: number;
  title: string;
  short_description?: string | null;
  date: string;
  location?: string | null;
  protocol_count?: number;
  agenda?: { title: string; poll_count?: number }[];
}

async function meeting(id: number): Promise<MeetingDetail | null> {
  try {
    const m = await fetchJson<RawMeetingDetail>(SITE, api(`meeting/public/meetings/${id}/`), { revalidate: 3600, timeoutMs: 12_000 });
    return {
      id: m.id,
      title: cleanText(m.title),
      description: cleanText(m.short_description) || null,
      date: toLocalDate(m.date) ?? m.date.slice(0, 10),
      location: cleanText(m.location) || null,
      agenda: (m.agenda ?? []).map((a) => ({ title: cleanText(a.title).replace(/^[.:]\s*/, ""), polls: a.poll_count ?? 0 })),
      protocolCount: m.protocol_count ?? null,
      url: officialUrl.meeting(m.id),
    };
  } catch (error) {
    if (error instanceof SourceError && error.status === 404) return null;
    throw error;
  }
}

interface RawProtocol { order: number; speaker?: { name?: string; party?: string | null } | null; text?: string | null }
interface RawProtocolPage { pagination?: { total_pages?: number }; results?: RawProtocol[] }

const transcriptCache = new Map<number, { value: TranscriptEntry[]; expires: number }>();
const transcriptInflight = new Map<number, Promise<TranscriptEntry[]>>();

function transcript(id: number): Promise<TranscriptEntry[]> {
  const hit = transcriptCache.get(id);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  const running = transcriptInflight.get(id);
  if (running) return running;
  const promise = fetchTranscript(id).finally(() => transcriptInflight.delete(id));
  transcriptInflight.set(id, promise);
  return promise;
}

async function fetchTranscript(id: number): Promise<TranscriptEntry[]> {
  const url = (page: number) => api(`meeting/public/meetings/${id}/protocols/?page_size=100&page=${page}`);
  const first = await fetchJson<RawProtocolPage>(SITE, url(1), { timeoutMs: 15_000 });
  const pages = Math.min(first.pagination?.total_pages ?? 1, 8);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchJson<RawProtocolPage>(SITE, url(i + 2), { timeoutMs: 15_000 }).catch(() => ({ results: [] }))));
  const value = [first, ...rest]
    .flatMap((p) => p.results ?? [])
    .map((r) => ({ order: r.order, speaker: cleanText(r.speaker?.name) || null, party: cleanText(r.speaker?.party) || null, text: cleanText(r.text) }))
    .filter((r) => r.text)
    .sort((a, b) => a.order - b.order);
  transcriptCache.set(id, { value, expires: Date.now() + 60 * 60 * 1000 });
  if (transcriptCache.size > 10) transcriptCache.delete(transcriptCache.keys().next().value!);
  return value;
}

interface RawSiteHit { type?: string; title?: string; description?: string | null; link?: string; published_at?: string | null }

async function siteSearch(query: string): Promise<SiteSearchHit[]> {
  const hits = await fetchJson<RawSiteHit[]>(SITE, api(`search/?q=${encodeURIComponent(query.slice(0, 100))}`), { revalidate: 600, timeoutMs: 12_000 });
  return (Array.isArray(hits) ? hits : [])
    .filter((h) => h.title && typeof h.link === "string" && h.link.startsWith("/"))
    .map((h) => ({
      type: h.type ?? "page",
      title: cleanText(h.title),
      description: cleanText(h.description) || null,
      date: toLocalDate(h.published_at ?? null),
      url: `https://new.parliament.mn${h.link}`,
    }));
}

/**
 * Laws people ask about most (lawIds verified on legalinfo.mn 2026-09-25). Loading them ahead of time
 * spares the first asker a 5–10 s download: Зөрчлийн тухай, Хөдөлмөрийн тухай, Нийгмийн халамжийн тухай,
 * Иргэний хууль, Замын хөдөлгөөний аюулгүй байдлын тухай, Хүний хувийн мэдээлэл хамгаалах тухай, and for the chat
 * dock's "Хууль яаж батлагддаг вэ?": УИХ-ын чуулганы хуралдааны дэгийн тухай, Хууль тогтоомжийн тухай.
 */
const COMMON_LAWS = ["12695", "16230709635751", "393", "299", "11224", "16390288615991", "17140612614151", "11119"];
let warmed = false;

/** Fire-and-forget, once per server process, one page at a time (polite to the official sites). */
export function warmUp(): void {
  if (warmed) return;
  warmed = true;
  void (async () => {
    await Promise.allSettled([legalinfoCookie(), bills(), meetingsIndex()]);
    for (const id of COMMON_LAWS) await lawDocument(id).catch(() => null);
  })();
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
  lawSearch,
  lawDocument,
  passedActs,
  meetingsIndex,
  meeting,
  transcript,
  siteSearch,
};
