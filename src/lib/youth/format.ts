// Mongolian date helpers for the youth pages (browser-safe).

const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

/** "2026.10.03, Бямба" */
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00+08:00`);
  return `${date.replaceAll("-", ".")}, ${WEEKDAYS[new Date(d.getTime() + 8 * 3600_000).getUTCDay()]}`;
}
/** "2026.10.03, Бямба · 10:00–13:00" */
export const slotLabel = (s: { date: string; start: string; end: string }) => `${dayLabel(s.date)} · ${s.start}–${s.end}`;
export const gradeLabel = (min: number, max: number) => (min === max ? `${min}-р анги` : `${min}–${max}-р анги`);
export const todayUB = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
