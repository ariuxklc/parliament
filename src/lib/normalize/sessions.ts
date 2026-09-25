import type { ParliamentSession, SessionKind } from "../types";
import type { RawAttendanceSession } from "../sources/parliamentSite";
import { daysBetween, todayLocal } from "../format";

/**
 * Official session model.
 *
 * Source of truth: new.parliament.mn `/api/meeting/attendance_overview/` → `sessions[]`, e.g.
 *   { key: "2026-fall", label: "2026 оны Намрын ээлжит чуулган", start_date: "2026-09-15", end_date: "2026-09-22", meeting_count: 4 }
 *   { key: "2026-irregular-2026-09-07", label: "2026 оны ээлжит бус чуулган", … }
 * Labels are displayed verbatim — we never invent session names.
 *
 * `end_date` is the last plenary meeting recorded so far, not the official closing date. The most
 * recent session is treated as still open when its last meeting was within OPEN_WINDOW_DAYS.
 */
const OPEN_WINDOW_DAYS = 21;

function kindOf(key: string): SessionKind {
  if (/^\d{4}-spring$/.test(key)) return "spring";
  if (/^\d{4}-fall$/.test(key)) return "fall";
  if (/^\d{4}-irregular/.test(key)) return "irregular";
  return "other";
}

export function normalizeSessions(raw: RawAttendanceSession[] | null | undefined, today = todayLocal()): ParliamentSession[] {
  const sessions = (raw ?? [])
    .filter((s) => s && typeof s.key === "string" && s.start_date && s.end_date)
    .map((s) => ({
      key: s.key,
      label: s.label?.trim() || s.key,
      year: Number(s.key.slice(0, 4)),
      kind: kindOf(s.key),
      startDate: s.start_date!,
      endDate: s.end_date!,
      meetingCount: Number(s.meeting_count) || 0,
      isOpen: false,
    }))
    .filter((s) => Number.isFinite(s.year))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  if (sessions[0] && daysBetween(sessions[0].endDate, today) <= OPEN_WINDOW_DAYS) sessions[0].isOpen = true;
  return sessions;
}

/** Date window used to place a proposal in a session. Open sessions extend to today. */
export function sessionWindow(s: ParliamentSession, today = todayLocal()): [string, string] {
  return [s.startDate, s.isOpen ? today : s.endDate];
}

export function sessionForDate(date: string, sessions: ParliamentSession[], today = todayLocal()): string | null {
  for (const s of sessions) {
    const [from, to] = sessionWindow(s, today);
    if (date >= from && date <= to) return s.key;
  }
  return null;
}

/**
 * Parliament API agenda codes encode the session: YYYY + SS + NNNNN.
 * Mapping verified from vote dates: 01 → "YYYY-spring", 02 → "YYYY-fall". Anything else → null.
 */
export function agendaCodeToSessionKey(code: string): string | null {
  const m = /^(\d{4})(\d{2})\d{5}$/.exec(code);
  if (!m) return null;
  if (m[2] === "01") return `${m[1]}-spring`;
  if (m[2] === "02") return `${m[1]}-fall`;
  return null;
}

/** Short label for compact controls: "Хаврын ээлжит чуулган" (year dropped — it is already selected). */
export function sessionShortLabel(s: ParliamentSession): string {
  return s.label.replace(/^\d{4}\s+оны\s+/i, "").replace(/^./, (c) => c.toUpperCase());
}
