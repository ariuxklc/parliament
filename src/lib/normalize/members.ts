import type { AttendanceBreakdownItem, MemberPosition, MemberProfile, MemberSummary, Party } from "../types";
import type { RawAttendanceMember, RawMemberDetail, RawMemberListItem, RawParty } from "../sources/parliamentSite";
import { cleanText } from "../format";
import { officialUrl } from "../site";
import { safeImage } from "../images";

/**
 * Party colours sampled (dominant non-neutral pixel) from each party's official logo on
 * new.parliament.mn/uploads/unit/ on 2026-09-25. Used only to tell groups apart in charts.
 */
export const PARTY_COLORS: Record<number, string> = {
  2: "#D7191F", // Монгол Ардын нам
  3: "#1B4AA8", // Ардчилсан нам
  6: "#633579", // Хүн нам
  4: "#16874A", // Иргэний зориг ногоон нам
  5: "#0E766B", // Үндэсний эвсэл
};
const FALLBACK_PARTY_COLOR = "#6B7280";

export function normalizeParty(raw: RawParty | null | undefined): Party | null {
  if (!raw || typeof raw.id !== "number") return null;
  return { id: raw.id, name: cleanText(raw.name), logo: safeImage(raw.logo), color: PARTY_COLORS[raw.id] ?? FALLBACK_PARTY_COLOR };
}

/** "Төсвийн байнгын хороо" → "Төсвийн байнгын хорооны" (genitive, for "…хорооны дарга"). */
function genitiveUnit(name: string): string {
  return /хороо$/i.test(name) ? `${name}ны` : name;
}

function roleOf(positions: RawMemberListItem["positions"]): { role: string | null; roleShort: string | null; rank: number } {
  const chair = (p: { name: string }) => /^дарга$/i.test(p.name.trim());
  const deputy = (p: { name: string }) => /^дэд дарга$/i.test(p.name.trim());
  const parl = positions.filter((p) => p.unit_type === "PARLIAMENT");
  if (parl.some(chair)) return { role: "УИХ-ын дарга", roleShort: "УИХ-ын дарга", rank: 0 };
  if (parl.some(deputy)) return { role: "УИХ-ын дэд дарга", roleShort: "УИХ-ын дэд дарга", rank: 1 };
  const committeeChair = positions.find((p) => p.unit_type === "COMMITTEE" && chair(p));
  if (committeeChair) return { role: `${genitiveUnit(cleanText(committeeChair.unit_name))} дарга`, roleShort: "Байнгын хорооны дарга", rank: 2 };
  const subChair = positions.find((p) => (p.unit_type === "SUBCOMMITTEE" || p.unit_type === "TEMPORARY_COMMITTEE") && chair(p));
  if (subChair) {
    const short = subChair.unit_type === "SUBCOMMITTEE" ? "Дэд хорооны дарга" : "Түр хорооны дарга";
    return { role: `${genitiveUnit(cleanText(subChair.unit_name))} дарга`, roleShort: short, rank: 3 };
  }
  return { role: null, roleShort: null, rank: 9 };
}

export function normalizeMemberSummary(raw: RawMemberListItem): MemberSummary | null {
  if (!raw || typeof raw.id !== "number" || !raw.first_name) return null;
  const positions = Array.isArray(raw.positions) ? raw.positions : [];
  const { role, roleShort, rank } = roleOf(positions);
  const committees = positions.filter((p) => p.unit_type === "COMMITTEE");
  const firstName = cleanText(raw.first_name);
  const lastName = cleanText(raw.last_name);
  return {
    id: raw.id,
    firstName,
    lastName,
    shortName: lastName ? `${lastName.charAt(0)}.${firstName}` : firstName,
    portrait: safeImage(raw.profile_image),
    party: normalizeParty(raw.party),
    role,
    roleShort,
    leadershipRank: rank,
    committees: [...new Set(committees.map((c) => cleanText(c.unit_name)))],
    committeeIds: [...new Set(committees.map((c) => c.unit_id))],
    sourceUrl: officialUrl.member(raw.id),
  };
}

/** Leadership first (Speaker, deputies, committee chairs), then alphabetical like the official list. */
export function sortMembers(members: MemberSummary[]): MemberSummary[] {
  return [...members].sort((a, b) => a.leadershipRank - b.leadershipRank || a.firstName.localeCompare(b.firstName, "mn"));
}

/** Attendance statuses in display order; labels are overwritten by the official ones when present. */
const ATTENDANCE_KEYS: { key: string; status: string; fallback: string }[] = [
  { key: "on_time", status: "ON_TIME", fallback: "Цагтаа ирсэн" },
  { key: "late", status: "LATE", fallback: "Хоцорсон" },
  { key: "leave", status: "LEAVE", fallback: "Чөлөөтэй" },
  { key: "medical_leave", status: "MEDICAL_LEAVE", fallback: "Эмнэлгийн чөлөөтэй" },
  { key: "foreign_trip", status: "FOREIGN_TRIP", fallback: "Гадаад томилолттой" },
  { key: "local_trip", status: "LOCAL_TRIP", fallback: "Дотоод томилолттой" },
  { key: "absent", status: "ABSENT", fallback: "Тасалсан" },
  { key: "other", status: "OTHER", fallback: "Бусад" },
];

export function normalizeMemberProfile(detail: RawMemberDetail, attendance: RawAttendanceMember | null): MemberProfile {
  const election = [...(detail.election_results ?? [])].sort((a, b) => (b.election_date ?? "").localeCompare(a.election_date ?? ""))[0];
  const positions: MemberPosition[] = (detail.current_positions ?? [])
    .filter((p) => p.is_current !== false)
    .map((p) => ({ unitId: p.unit, unitName: cleanText(p.unit_name), unitType: p.unit_type, title: cleanText(p.position_name).replace(/^./, (c) => c.toUpperCase()) }));

  let att: MemberProfile["attendance"] = null;
  const s = attendance?.summary;
  if (s && Number.isFinite(s.percentage) && Number(s.total) > 0) {
    const officialLabels = new Map((attendance?.meetings ?? []).map((m) => [m.status, m.status_label]));
    const breakdown: AttendanceBreakdownItem[] = ATTENDANCE_KEYS.map(({ key, status, fallback }) => ({
      key,
      label: officialLabels.get(status) ?? fallback,
      count: Number(s[key]) || 0,
    })).filter((b) => b.count > 0);
    const sessions = attendance?.sessions ?? [];
    const earliest = sessions[sessions.length - 1];
    att = {
      percentage: Number(s.percentage),
      present: Number(s.present) || 0,
      total: Number(s.total) || 0,
      breakdown,
      scopeLabel: earliest ? `${earliest.label}аас хойш` : "Бүртгэгдсэн бүх нэгдсэн хуралдаан",
    };
  }

  return {
    id: detail.id,
    fullName: cleanText(detail.full_name) || `${detail.last_name} ${detail.first_name}`,
    shortName: cleanText(detail.short_name),
    portrait: safeImage(detail.profile_image),
    cover: safeImage(detail.cover_image),
    party: normalizeParty(detail.party),
    constituency: election
      ? {
          name: cleanText(election.constituency_name) || null,
          number: election.constituency_number ?? null,
          system: cleanText(election.election_system_display) || null,
          electionName: cleanText(election.election_name) || null,
        }
      : null,
    positions,
    attendance: att,
    sourceUrl: officialUrl.member(detail.id),
  };
}
