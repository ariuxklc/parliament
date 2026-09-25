import type {
  ParliamentSession,
  PeriodSummary,
  Proposal,
  ProposalQuery,
  ProposalSort,
  ProposalStageFilter,
  YearBucket,
} from "../types";
import type { LawForumListItem } from "../sources/lawforum";
import { cleanText, toLocalDate, todayLocal } from "../format";
import { officialUrl } from "../site";
import { sessionForDate, sessionWindow } from "./sessions";

/**
 * Time model for Хуулийн төслүүд (documented per the hackathon brief):
 *
 *  year        ← `publishedOnUtc` converted to Asia/Ulaanbaatar. This is the date LawForum shows on
 *                every card, i.e. when the proposal was opened to the public. LawForum has no
 *                submission/discussion date field, and `createdOnUtc`/`updatedOnUtc` are record
 *                timestamps available only on the detail endpoint.
 *  session     ← the official session (see sessions.ts) whose date window contains the publication
 *                date. LawForum itself has no session field, so this means "published during the
 *                session", and the UI says so explicitly. Proposals published between sessions have
 *                no session and appear only under the whole-year view.
 *  submittedAt ← not available from LawForum; stage 10 only tells us the proposal has been submitted.
 *  updatedAt   ← `updatedOnUtc` from the detail endpoint, fetched on demand for the "updated" sort.
 *  status      ← `stage` (0 drafting / 10 submitted); `status` 0 records are unlisted and skipped.
 *  category    ← `typeTitle` (law / resolution / …) + `categoryTitle` (standalone / amendment / …).
 *
 * Archive: LawForum holds records back to 2016 (sparse before 2021), all served by the same list.
 */

export const TYPE_SHORT_LABEL: Record<number, string> = {
  1: "Хуулийн төсөл",
  2: "УИХ-ын тогтоолын төсөл",
  4: "Тайлан мэдээлэл",
  5: "Цэцийн дүгнэлт",
  6: "Ерөнхийлөгчийн хориг",
};

export function normalizeProposal(raw: LawForumListItem, sessions: ParliamentSession[], today = todayLocal()): Proposal | null {
  if (!raw || typeof raw.id !== "number") return null;
  if (raw.status !== 1) return null; // not publicly listed on LawForum
  const publishedDate = toLocalDate(raw.publishedOnUtc);
  const title = cleanText(raw.title);
  if (!publishedDate || !title) return null;
  const stage = raw.stage === 10 ? "submitted" : raw.stage === 0 ? "drafting" : null;
  if (!stage) return null; // unknown stage code — do not guess
  return {
    id: raw.id,
    title,
    projectNumber: raw.projectNumber?.trim() || null,
    typeId: raw.typeId,
    typeTitle: cleanText(raw.typeTitle) || "Төсөл",
    categoryTitle: cleanText(raw.categoryTitle) || null,
    stage,
    publishedDate,
    year: Number(publishedDate.slice(0, 4)),
    sessionKey: sessionForDate(publishedDate, sessions, today),
    sourceUrl: officialUrl.lawforumProposal(raw.id, stage),
    summary: null,
  };
}

export function yearBuckets(all: Proposal[]): YearBucket[] {
  const counts = new Map<number, number>();
  for (const p of all) counts.set(p.year, (counts.get(p.year) ?? 0) + 1);
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year);
}

/** Sessions shown for a year: the ones the official source labels with that year. */
export function sessionsForYear(sessions: ParliamentSession[], year: number): ParliamentSession[] {
  return sessions.filter((s) => s.year === year).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function inPeriod(p: Proposal, year: number, session: ParliamentSession | null, today = todayLocal()): boolean {
  if (!session) return p.year === year;
  const [from, to] = sessionWindow(session, today);
  // A session window can cross the new year (autumn sessions run into January).
  return p.publishedDate >= from && p.publishedDate <= to;
}

export function summarize(items: Proposal[]): PeriodSummary {
  const byType = new Map<number, { typeId: number; typeTitle: string; count: number }>();
  let drafting = 0;
  for (const p of items) {
    if (p.stage === "drafting") drafting++;
    const t = byType.get(p.typeId) ?? { typeId: p.typeId, typeTitle: TYPE_SHORT_LABEL[p.typeId] ?? p.typeTitle, count: 0 };
    t.count++;
    byType.set(p.typeId, t);
  }
  return {
    total: items.length,
    drafting,
    submitted: items.length - drafting,
    byType: [...byType.values()].sort((a, b) => b.count - a.count),
  };
}

export function applyFilters(items: Proposal[], stage: ProposalStageFilter, typeId: number | null, q: string): Proposal[] {
  const needle = q.trim().toLocaleLowerCase("mn");
  return items.filter(
    (p) =>
      (stage === "all" || p.stage === stage) &&
      (typeId === null || p.typeId === typeId) &&
      (!needle || p.title.toLocaleLowerCase("mn").includes(needle) || (p.projectNumber ?? "").toLowerCase() === needle.toLowerCase()),
  );
}

export function sortProposals(items: Proposal[], sort: ProposalSort): Proposal[] {
  const byPublished = (a: Proposal, b: Proposal) => a.publishedDate.localeCompare(b.publishedDate) || a.id - b.id;
  const copy = [...items];
  if (sort === "oldest") return copy.sort(byPublished);
  if (sort === "updated") {
    const key = (p: Proposal) => p.updatedAt ?? `${p.publishedDate}T00:00:00`;
    return copy.sort((a, b) => key(b).localeCompare(key(a)) || b.id - a.id);
  }
  return copy.sort((a, b) => byPublished(b, a));
}

const SORTS: ProposalSort[] = ["newest", "oldest", "updated"];
const STAGES: ProposalStageFilter[] = ["all", "drafting", "submitted"];

/** Parse URL/query params into a valid query. Unknown values fall back to defaults. */
export function parseProposalQuery(params: URLSearchParams | Record<string, string | string[] | undefined>, defaults: { year: number }): ProposalQuery {
  const get = (k: string) => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const year = Number(get("year"));
  const typeId = Number(get("type"));
  const sort = get("sort") as ProposalSort;
  const stage = get("stage") as ProposalStageFilter;
  const limit = Number(get("limit"));
  return {
    year: Number.isInteger(year) && year > 2000 && year < 2100 ? year : defaults.year,
    session: get("session")?.slice(0, 64) || null,
    stage: STAGES.includes(stage) ? stage : "all",
    typeId: Number.isInteger(typeId) && typeId > 0 ? typeId : null,
    sort: SORTS.includes(sort) ? sort : "newest",
    q: (get("q") ?? "").slice(0, 120),
    limit: Number.isInteger(limit) && limit >= 6 && limit <= 96 ? limit : 12,
  };
}
