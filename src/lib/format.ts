/**
 * Date/number formatting in the conventions used on new.parliament.mn (browser-safe).
 * All dates are shown in Ulaanbaatar time.
 */

export const UB_TIMEZONE = "Asia/Ulaanbaatar";

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: UB_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const hm = new Intl.DateTimeFormat("en-GB", { timeZone: UB_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Parse a timestamp from an official source.
 * LawForum returns UTC timestamps without a zone suffix ("2026-09-22T16:00:00"), so a missing
 * suffix is treated as UTC. Plain dates ("2026-09-22") are treated as Ulaanbaatar calendar dates.
 */
export function parseSourceDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00+08:00`);
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(v);
  const d = new Date(hasZone ? v : `${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD in Ulaanbaatar time. */
export function toLocalDate(value: string | Date | null | undefined): string | null {
  const d = value instanceof Date ? value : parseSourceDate(value);
  return d ? ymd.format(d) : null;
}

/** "2026.09.23" — the dotted format used across official Parliament sites. */
export function formatDate(value: string | Date | null | undefined): string {
  const local = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toLocalDate(value);
  return local ? local.replaceAll("-", ".") : "";
}

export function formatTime(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? value : parseSourceDate(value);
  return d ? hm.format(d) : "";
}

/** Mongolian ordinal suffix for month numbers ("9 дүгээр сар", "10 дугаар сар"). */
function monthOrdinal(month: number): string {
  const last = month % 10;
  return last === 1 || last === 4 || last === 9 ? "дүгээр" : "дугаар";
}

/** "2026 оны 9 дүгээр сарын 23" */
export function formatDateLong(value: string | Date | null | undefined): string {
  const local = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toLocalDate(value);
  if (!local) return "";
  const [y, m, d] = local.split("-").map(Number);
  return `${y} оны ${m} ${monthOrdinal(m)} сарын ${d}`;
}

/** "9 дүгээр сарын 15" */
export function formatMonthDay(value: string | Date | null | undefined): string {
  const local = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toLocalDate(value);
  if (!local) return "";
  const [, m, d] = local.split("-").map(Number);
  return `${m} ${monthOrdinal(m)} сарын ${d}`;
}

const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

export function weekdayOf(localDate: string): string {
  const d = new Date(`${localDate}T12:00:00+08:00`);
  return WEEKDAYS[d.getUTCDay()];
}

const num = new Intl.NumberFormat("en-US");
export function formatNumber(n: number): string {
  return num.format(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits).replace(/\.0$/, "")}%`;
}

/** Collapse whitespace/newlines in official titles (bulletin titles contain hard line breaks). */
export function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function todayLocal(): string {
  return toLocalDate(new Date())!;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
