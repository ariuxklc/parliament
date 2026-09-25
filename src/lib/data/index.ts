import "server-only";
import type {
  AttendanceOverviewStat,
  BillBulletinSummary,
  CurrentSessionInfo,
  Loaded,
  MemberProfile,
  MemberRoster,
  MemberSummary,
  NavItem,
  NewsItem,
  ParliamentComposition,
  ParliamentSession,
  Proposal,
  ProposalQuery,
  ProposalsResponse,
  VoteSummary,
  WeeklySchedule,
} from "../types";
import { load, mapLimit } from "../http";
import { safeImage } from "../images";
import { officialUrl } from "../site";
import { parsePetitions, type PetitionItem } from "../normalize/petitions";
import { todayLocal, parseSourceDate, cleanText } from "../format";
import { getAllProposals, getProposalDetail } from "../sources/lawforum";
import { parliamentSite } from "../sources/parliamentSite";
import { parliamentApi } from "../sources/parliamentApi";
import { agendaCodeToSessionKey, normalizeSessions } from "../normalize/sessions";
import {
  applyFilters,
  inPeriod,
  normalizeProposal,
  sessionsForYear,
  sortProposals,
  summarize,
  yearBuckets,
} from "../normalize/proposals";
import { normalizeMemberProfile, normalizeMemberSummary, sortMembers } from "../normalize/members";
import {
  normalizeAttendanceOverview,
  normalizeBulletin,
  normalizeComposition,
  normalizeCurrent,
  normalizeMenu,
  normalizeNews,
  normalizePolls,
  normalizeSchedule,
} from "../normalize/activity";

/*
 * Homepage component → source → endpoint → fields (see docs/homepage-data-map.md for the full table)
 *
 *  Hero / CurrentActivity  → new.parliament.mn  /meeting/attendance_overview/  sessions[].{key,label,start_date,end_date,meeting_count}
 *                                               /meeting/public/latest-meetings/ plenary.{id,short_description,date,location}
 *                                               /meeting/public/live-video/     video.{is_live,video_url,date}
 *  WeekSchedule            → new.parliament.mn  /parliament/schedules/latest/   data.days[].sections[].events[]
 *  LatestVotes             → new.parliament.mn  /meeting/public-polls/          total_for/against/voted, result_label
 *  BillBulletin            → new.parliament.mn  /bills-public/                  category_display, committee_name, bulletin_snapshot_at
 *  CurrentLegislation      → LawForum API       /api/v1/projects(/{id})         title,typeTitle,categoryTitle,stage,status,publishedOnUtc,updatedOnUtc
 *                          → Parliament API     getAgendaList                   agendaCode (session-coded), agendaName
 *  MemberGrid              → new.parliament.mn  /parliament_members_list/       first/last name, profile_image, party, positions
 *  MemberProfileCard       → new.parliament.mn  /parliament_member/detail/{id}/ election_results, current_positions, cover_image
 *                                               /meeting/attendance_members/{id}/ summary.{percentage,present,total,…}
 *  StatsSection            → new.parliament.mn  /members/statistics/            party, sex, election
 *                                               /meeting/attendance_overview/   summary.average_attendance
 *  NewsSection             → new.parliament.mn  /featured-news/, /news/articles/ title, slug, category_name, cover_image, published_at
 *  SiteHeader              → new.parliament.mn  /menu/header/                   label, external_url, linked_news_slug, sub[]
 */

/* ------------------------------------------------------------------ sessions */

export async function getSessions(): Promise<ParliamentSession[]> {
  const res = await load("sessions", () => parliamentSite.attendanceOverview());
  return res.ok ? normalizeSessions(res.data.sessions) : [];
}

/* ----------------------------------------------------------------- proposals */

async function getNormalizedProposals(sessions: ParliamentSession[]): Promise<Proposal[]> {
  const today = todayLocal();
  const raw = await getAllProposals();
  return raw.map((r) => normalizeProposal(r, sessions, today)).filter((p): p is Proposal => p !== null);
}

const UPDATED_SORT_CAP = 250;

/** Adds `updatedAt` from the LawForum detail endpoint (only used for the "recently updated" sort). */
async function withUpdatedAt(items: Proposal[]): Promise<{ items: Proposal[]; capped: boolean }> {
  const newestFirst = [...items].sort((a, b) => b.id - a.id);
  const target = newestFirst.slice(0, UPDATED_SORT_CAP);
  const details = await mapLimit(target, 8, async (p) => {
    try {
      const d = await getProposalDetail(p.id);
      const stamp = parseSourceDate(d.updatedOnUtc) ?? parseSourceDate(d.createdOnUtc);
      return stamp ? stamp.toISOString() : null;
    } catch {
      return null;
    }
  });
  const byId = new Map(target.map((p, i) => [p.id, details[i]]));
  return { items: target.map((p) => ({ ...p, updatedAt: byId.get(p.id) ?? null })), capped: items.length > target.length };
}

async function agendaForPeriod(year: number, session: ParliamentSession | null): Promise<ProposalsResponse["agenda"]> {
  if (!parliamentApi.isConfigured()) return null;
  if (session && session.kind !== "spring" && session.kind !== "fall") return null; // no session code for irregular sessions
  const res = await load("parliament agenda", () => parliamentApi.agendaList());
  if (!res.ok) return null;
  const matches = res.data.filter((a) => {
    const key = agendaCodeToSessionKey(a.agendaCode);
    if (!key) return false;
    return session ? key === session.key : key.startsWith(`${year}-`);
  });
  if (!matches.length) return null;
  const codes = [...new Set(matches.map((a) => a.agendaCode.slice(0, 6)))].sort();
  return {
    total: matches.length,
    sessionCodes: codes,
    items: matches
      .sort((a, b) => b.agendaCode.localeCompare(a.agendaCode))
      .map((a) => ({ code: a.agendaCode, title: cleanText(a.agendaName).replace(/^[.:]\s*/, "") })),
  };
}

export async function getProposals(query: ProposalQuery): Promise<ProposalsResponse> {
  const sessions = await getSessions();
  const all = await getNormalizedProposals(sessions);
  const years = yearBuckets(all);
  const year = years.some((y) => y.year === query.year) ? query.year : (years[0]?.year ?? Number(todayLocal().slice(0, 4)));
  const yearSessions = sessionsForYear(sessions, year);
  const session = yearSessions.find((s) => s.key === query.session) ?? null;
  const today = todayLocal();

  const periodItems = all.filter((p) => inPeriod(p, year, session, today));
  let filtered = applyFilters(periodItems, query.stage, query.typeId, query.q);
  const notes: string[] = [];

  if (query.sort === "updated" && filtered.length) {
    const enriched = await withUpdatedAt(filtered);
    filtered = enriched.items;
    if (enriched.capped) notes.push(`Шинэчлэлтийн огноогоор эрэмбэлэхэд сүүлийн ${UPDATED_SORT_CAP} төслийг харьцуулав.`);
  }

  const sorted = sortProposals(filtered, query.sort);
  const agenda = await agendaForPeriod(year, session);
  if (!yearSessions.length) notes.push("Энэ оны чуулганы хугацааны мэдээлэл албан ёсны эх сурвалжид байхгүй тул жилээр харуулж байна.");

  const sessionCounts = Object.fromEntries(yearSessions.map((s) => [s.key, all.filter((p) => inPeriod(p, year, s, today)).length]));

  return {
    query: { ...query, year, session: session?.key ?? null },
    years,
    sessions: yearSessions,
    sessionCounts,
    period: summarize(periodItems),
    matched: sorted.length,
    items: sorted.slice(0, query.limit),
    agenda,
    notes,
  };
}

/* ------------------------------------------------------------------- members */

export async function getMemberRoster(): Promise<Loaded<MemberRoster>> {
  return load("member roster", async () => {
    const raw = await parliamentSite.membersList();
    const members = sortMembers((raw.members ?? []).map(normalizeMemberSummary).filter((m): m is MemberSummary => m !== null));
    const counts = new Map<number, number>();
    for (const m of members) if (m.party) counts.set(m.party.id, (counts.get(m.party.id) ?? 0) + 1);
    const parties = (raw.filters?.parties ?? [])
      .map((p) => {
        const party = members.find((m) => m.party?.id === p.id)?.party;
        return party ? { ...party, count: counts.get(p.id) ?? 0 } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.count > 0);
    const committees = (raw.filters?.committees ?? [])
      .sort((a, b) => a.display_order - b.display_order)
      .map((c) => ({ id: c.id, name: cleanText(c.name) }));
    return { members, parties, committees };
  });
}

export async function getMemberProfile(id: number): Promise<MemberProfile> {
  const [detail, attendance] = await Promise.all([
    parliamentSite.memberDetail(id),
    parliamentSite.memberAttendance(id).catch(() => null), // attendance is optional
  ]);
  return normalizeMemberProfile(detail, attendance);
}

/* ------------------------------------------------------------------ activity */

export async function getCurrentActivity(sessions: ParliamentSession[]): Promise<CurrentSessionInfo> {
  const [latest, live] = await Promise.all([load("latest meetings", parliamentSite.latestMeetings), load("live video", parliamentSite.liveVideo)]);
  return normalizeCurrent(sessions, latest.ok ? latest.data : null, live.ok ? live.data : null);
}

export async function getWeeklySchedule(): Promise<Loaded<WeeklySchedule | null>> {
  return load("schedule", async () => normalizeSchedule(await parliamentSite.latestSchedule()));
}

export async function getLatestVotes(n = 5): Promise<Loaded<VoteSummary[]>> {
  return load("latest votes", async () => normalizePolls((await parliamentSite.latestPolls(n)).results));
}

export async function getBillBulletin(): Promise<Loaded<BillBulletinSummary | null>> {
  return load("bill bulletin", async () => normalizeBulletin(await parliamentSite.billBulletin()));
}

/** Proposals currently open for public comment on LawForum (stage 0, listed). */
export async function getOpenForComment(): Promise<Loaded<{ count: number; latest: Proposal[] }>> {
  return load("open drafts", async () => {
    const all = await getNormalizedProposals([]);
    const open = all.filter((p) => p.stage === "drafting").sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || b.id - a.id);
    const year = Number(todayLocal().slice(0, 4));
    return { count: open.filter((p) => p.year === year).length, latest: open.slice(0, 3) };
  });
}

/* ---------------------------------------------------------------------- news */

export async function getNews(): Promise<Loaded<NewsItem[]>> {
  return load("news", async () => {
    const [featured, latest] = await Promise.all([
      parliamentSite.featuredNews(),
      parliamentSite.latestNews(8).then((r) => r.results).catch(() => [] as never[]), // slow endpoint — optional
    ]);
    const items = [...normalizeNews(featured, true), ...normalizeNews(latest, false)];
    // keep the first occurrence so an item's "featured" flag is not overwritten by its copy in the latest list
    const seen = new Set<number>();
    const unique = items.filter((n) => !seen.has(n.id) && (seen.add(n.id), true));
    if (!unique.length) throw new Error("no news items");
    return unique;
  });
}

/* --------------------------------------------------------------------- stats */

export async function getComposition(): Promise<Loaded<ParliamentComposition>> {
  return load("composition", async () => {
    const [stats, list] = await Promise.all([parliamentSite.membersStatistics(), parliamentSite.membersList().catch(() => null)]);
    return normalizeComposition(stats, list);
  });
}

export async function getAttendanceStat(sessions: ParliamentSession[]): Promise<Loaded<AttendanceOverviewStat | null>> {
  return load("attendance overview", async () => normalizeAttendanceOverview(await parliamentSite.attendanceOverview(), sessions));
}

/* ----------------------------------------------------------------- petitions */

export async function getPetitions(): Promise<Loaded<PetitionItem[]>> {
  return load("petitions", async () => {
    const items = parsePetitions(await parliamentSite.petitionsHtml(), 4);
    if (!items.length) throw new Error("no petitions parsed");
    return items;
  });
}

/* ---------------------------------------------------------------- committees */

export interface CommitteeInfo {
  id: number;
  name: string;
  icon: string | null;
  chair: string | null; // official short name, e.g. "Ж.Батжаргал"
  memberCount: number;
  url: string;
}

export async function getCommittees(roster: MemberRoster | null): Promise<Loaded<CommitteeInfo[]>> {
  return load("committees", async () => {
    const units = await parliamentSite.committees();
    return units
      .sort((a, b) => a.display_order - b.display_order)
      .map((u) => {
        const name = cleanText(u.name);
        const members = roster?.members.filter((m) => m.committeeIds.includes(u.id)) ?? [];
        const chairRole = /хороо$/i.test(name) ? `${name}ны дарга` : `${name} дарга`; // same wording as normalize/members.ts
        const chair = members.find((m) => m.role === chairRole);
        return {
          id: u.id,
          name,
          icon: safeImage(u.icon),
          chair: chair?.shortName ?? null,
          memberCount: members.length,
          url: officialUrl.committee(u.id),
        };
      });
  });
}

/* ---------------------------------------------------------------------- menu */

export async function getNavigation(): Promise<NavItem[]> {
  const res = await load("header menu", parliamentSite.headerMenu);
  return res.ok ? normalizeMenu(res.data) : [];
}
