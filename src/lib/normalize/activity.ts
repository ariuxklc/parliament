import type {
  AttendanceOverviewStat,
  BillBulletinSummary,
  CurrentSessionInfo,
  NavItem,
  NewsItem,
  ParliamentComposition,
  ParliamentSession,
  ScheduleEvent,
  VoteSummary,
  WeeklySchedule,
} from "../types";
import type {
  RawAttendanceOverview,
  RawBill,
  RawLatestMeetings,
  RawLiveVideo,
  RawMembersList,
  RawMembersStatistics,
  RawMenuItem,
  RawNewsItem,
  RawPoll,
  RawSchedule,
} from "../sources/parliamentSite";
import { cleanText } from "../format";
import { officialUrl, PARLIAMENT_SITE } from "../site";
import { safeImage } from "../images";
import { normalizeParty } from "./members";

export function normalizeCurrent(
  sessions: ParliamentSession[],
  latest: RawLatestMeetings | null,
  live: RawLiveVideo | null,
): CurrentSessionInfo {
  const p = latest?.plenary;
  const v = live?.video;
  return {
    session: sessions[0] ?? null,
    latestPlenary: p
      ? {
          id: p.id,
          title: cleanText(p.title),
          description: cleanText(p.short_description),
          date: p.date,
          location: p.location ?? null,
          sourceUrl: officialUrl.meeting(p.id),
        }
      : null,
    live: v && v.video_url ? { isLive: Boolean(v.is_live), title: cleanText(v.title), date: v.date, videoUrl: v.video_url } : null,
  };
}

/** Schedule types seen in the official data: PLENARY, STANDING_COMMITTEE, WORKING_GROUP. */
function eventKind(type: string): ScheduleEvent["kind"] {
  if (type === "PLENARY") return "PLENARY";
  if (type === "STANDING_COMMITTEE" || type === "COMMITTEE" || type === "SUBCOMMITTEE") return "COMMITTEE";
  if (type === "WORKING_GROUP") return "WORKING_GROUP";
  return "OTHER";
}

export function normalizeSchedule(raw: RawSchedule | null): WeeklySchedule | null {
  if (!raw?.data?.days?.length) return null;
  return {
    title: cleanText(raw.title),
    startDate: raw.start_date,
    endDate: raw.end_date,
    fileUrl: raw.file_url ?? null,
    days: raw.data.days
      .filter((d) => d?.date)
      .map((d) => ({
        date: d.date,
        weekday: cleanText(d.weekday),
        events: (d.sections ?? []).flatMap((s) =>
          (s.events ?? []).map((e) => {
            const title = cleanText(e.title) || cleanText(e.meeting) || cleanText(s.name);
            return {
              time: e.time && /\d/.test(e.time) ? e.time : null,
              room: cleanText(e.room) || null,
              title,
              kind: eventKind(e.type || s.type),
              // working-group entries repeat their title as the only agenda item — drop the duplicate
              agendaItems: (e.agenda_items ?? []).map(cleanText).filter((a) => a && a !== title),
            };
          }),
        ),
      })),
  };
}

/** Strip the list numbering ("92.") the plenary system prefixes to each motion. */
function cleanMotion(name: string): string {
  return cleanText(name).replace(/^\d+\s*[.)]\s*/, "");
}

export function normalizePolls(raw: RawPoll[] | null | undefined): VoteSummary[] {
  return (raw ?? [])
    .filter((p) => p && typeof p.id === "number" && Number.isFinite(p.total_voted) && p.total_voted > 0)
    .map((p) => ({
      id: p.id,
      motion: cleanMotion(p.name),
      agendaTitle: cleanText(p.agenda_title).replace(/^[.:]\s*/, "") || null,
      meetingTitle: cleanText(p.meeting_title),
      date: p.meeting_date,
      forCount: p.total_for,
      againstCount: p.total_against,
      totalVoted: p.total_voted,
      resultLabel: cleanText(p.result_label),
      resultKey: p.result_key,
      sourceUrl: officialUrl.vote(p.id),
    }));
}

export function normalizeBulletin(raw: RawBill[] | null | undefined): BillBulletinSummary | null {
  if (!raw?.length) return null;
  const count = (key: (b: RawBill) => string | null) => {
    const m = new Map<string, number>();
    for (const b of raw) {
      const k = cleanText(key(b));
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };
  return {
    title: cleanText(raw[0].bulletin_title),
    snapshotAt: raw[0].bulletin_snapshot_at,
    total: raw.length,
    byCategory: count((b) => b.category_display),
    byCommittee: count((b) => b.committee_name),
    sourceUrl: officialUrl.billBulletin(),
  };
}

export function normalizeNews(raw: RawNewsItem[] | null | undefined, featured: boolean): NewsItem[] {
  return (raw ?? [])
    .filter((n) => n && typeof n.id === "number" && n.title && n.slug && (!n.status || n.status === "PUBLISHED"))
    .map((n) => ({
      id: n.id,
      title: cleanText(n.title),
      category: cleanText(n.category_name) || null,
      excerpt: cleanText(n.short_description).replace(/\.{3}$|…$/, "…") || null,
      cover: safeImage(n.cover_image),
      publishedAt: n.published_at,
      featured,
      sourceUrl: officialUrl.news(n.slug),
    }));
}

export function normalizeComposition(stats: RawMembersStatistics, list: RawMembersList | null): ParliamentComposition {
  const partyById = new Map((list?.filters?.parties ?? []).map((p) => [p.id, p]));
  const firstTerm = stats.election?.find((e) => e.elected_count === 1)?.count ?? null;
  return {
    totalMembers: stats.total_members,
    parties: (stats.party ?? [])
      .map((p) => ({
        party: normalizeParty(partyById.get(p.party_id) ?? { id: p.party_id, name: p.party_name, logo: null })!,
        seats: p.count,
      }))
      .sort((a, b) => b.seats - a.seats),
    sex: (stats.sex ?? []).map((s) => ({ label: cleanText(s.label), count: s.count })),
    firstTermCount: firstTerm,
    termBreakdown: (stats.election ?? []).map((e) => ({ label: cleanText(e.label), count: e.count })),
  };
}

export function normalizeAttendanceOverview(raw: RawAttendanceOverview, sessions: ParliamentSession[]): AttendanceOverviewStat | null {
  const avg = Number(raw.summary?.average_attendance);
  if (!Number.isFinite(avg)) return null;
  const oldest = sessions[sessions.length - 1];
  return {
    averagePercentage: avg,
    meetingCount: sessions.reduce((n, s) => n + s.meetingCount, 0),
    firstSessionLabel: oldest?.label ?? null,
    lastMeetingDate: sessions[0]?.endDate ?? null,
  };
}

function menuHref(item: RawMenuItem): string {
  if (item.link_type === "NEWS" && item.linked_news_slug) return officialUrl.news(item.linked_news_slug);
  return item.external_url || PARLIAMENT_SITE;
}

export function normalizeMenu(raw: RawMenuItem[] | null | undefined): NavItem[] {
  return (raw ?? [])
    .filter((m) => m?.label)
    .map((m) => ({
      label: cleanText(m.label),
      href: menuHref(m),
      external: true,
      children: (m.sub ?? []).filter((s) => s?.label).map((s) => ({ label: cleanText(s.label), href: menuHref(s), external: true })),
    }));
}
