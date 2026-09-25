import type { BillRecord, BulletinBill } from "./records.ts";
import { similar, titleMatch, topicTokens } from "./text.ts";

/**
 * Bill helpers shared by the bill page and the assistant's tools.
 * LawForum records and bill-bulletin rows have no shared id, and amendment bills often share a title
 * across years, so they are linked only on a strong title match with dates within 10 days.
 */

const DAY = 86_400_000;

export function stageListing(stage: BillRecord["stage"]): string {
  return stage === "submitted"
    ? "LawForum-ын «Өргөн мэдүүлсэн төслүүд» хэсэгт бүртгэлтэй"
    : "LawForum-ын «Боловсруулж буй төслүүд» хэсэгт бүртгэлтэй (олон нийтээс санал авч буй)";
}

export function titleSimilarity(a: string, b: string): number {
  const ta = [...new Set(topicTokens(a))];
  const tb = [...new Set(topicTokens(b))];
  if (!ta.length || !tb.length) return 0;
  const shared = ta.filter((x) => tb.some((y) => similar(x, y))).length;
  return shared / (ta.length + tb.length - shared);
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

export function linkBulletin(bill: BillRecord, rows: readonly BulletinBill[]): BulletinBill | undefined {
  if (bill.stage !== "submitted") return undefined;
  const hits = rows.filter((r) => r.submittedDate && daysApart(r.submittedDate, bill.publishedDate) <= 10 && titleSimilarity(bill.title, r.title) >= 0.6);
  return hits.length === 1 ? hits[0] : undefined;
}

export function linkLawForum(row: BulletinBill, bills: readonly BillRecord[]): BillRecord | undefined {
  if (!row.submittedDate) return undefined;
  const hits = bills.filter((b) => b.stage === "submitted" && daysApart(row.submittedDate!, b.publishedDate) <= 10 && titleSimilarity(b.title, row.title) >= 0.6);
  return hits.length === 1 ? hits[0] : undefined;
}

/** Relevance of a title to query words: 0 when no word matches. */
export function titleScore(queryWords: string[], title: string): number {
  const m = titleMatch(queryWords, title);
  return m.hits ? m.coverage * 2 + m.hits * 0.5 : 0;
}
