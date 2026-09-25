/**
 * Links a d.parliament.mn project to its LawForum record — verified, never by title alone.
 *
 * Both systems publish the same official files: LawForum bill pages link "/files/{id}/?d=1" with exactly
 * the file ids d.parliament.mn lists (verified on LawForum 11168 ↔ d.parliament 9fc73f2c…: 11/11 ids).
 *   1. candidates: LawForum records whose normalized title equals the project's,
 *      nearest publish date first (same-titled amendment bills recur across years);
 *   2. confirmed only if the candidate's public page lists at least one of the project's file ids.
 * Node-compatible (used by the offline script and, once per project, by the detail page).
 */

import { titleKey, LAWFORUM_ORIGIN } from "./normalize.ts";
import type { SubmittedProject } from "./types.ts";

const API = "https://lawforum.parliament.mn/LawForumAPI/api/v1";

interface LfItem {
  id: number;
  title: string | null;
  stage: number;
  publishedOnUtc: string | null;
}

let listPromise: Promise<LfItem[]> | null = null;
let listAt = 0;

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`LawForum HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** All LawForum records (≈1,000, 11 requests), cached in-process for 30 minutes. */
function lawforumList(): Promise<LfItem[]> {
  if (listPromise && Date.now() - listAt < 30 * 60_000) return listPromise;
  listAt = Date.now();
  listPromise = (async () => {
    type Page = { totalPages: number; items: LfItem[] | null };
    const first = await getJson<Page>(`${API}/projects?page=1&pageSize=100`, 20_000);
    const out = [...(first.items ?? [])];
    for (let p = 2; p <= Math.min(first.totalPages ?? 1, 30); p++) {
      out.push(...((await getJson<Page>(`${API}/projects?page=${p}&pageSize=100`, 20_000)).items ?? []));
    }
    return out;
  })().catch((err) => {
    listPromise = null;
    throw err;
  });
  return listPromise;
}

/** File ids listed on a LawForum bill page (the page is server-rendered, ≈1 MB). */
async function lawforumPageFileIds(item: LfItem): Promise<Set<number>> {
  const url = `${LAWFORUM_ORIGIN}/${item.stage === 10 ? "project" : "draft"}/${item.id}/`;
  const res = await fetch(url, { headers: { Accept: "text/html" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return new Set();
  const html = await res.text();
  return new Set([...html.matchAll(/href="\/files\/(\d{1,9})\/(?:\?d=1)?"/g)].map((m) => Number(m[1])));
}

function dayDistance(a: string | null, b: string | null): number {
  if (!a || !b) return 9_999;
  return Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000;
}

export interface LawForumMatch {
  lawforumId: number | null;
  sharedFiles: number;
}

export async function findLawForumMatch(project: SubmittedProject): Promise<LawForumMatch> {
  const fileIds = new Set(project.documents.map((d) => d.fileId));
  if (!fileIds.size) return { lawforumId: null, sharedFiles: 0 };
  const key = titleKey(project.title);
  const candidates = (await lawforumList())
    .filter((x) => x.title && titleKey(x.title) === key)
    .sort((a, b) => dayDistance(a.publishedOnUtc, project.date) - dayDistance(b.publishedOnUtc, project.date))
    .slice(0, 3);
  for (const c of candidates) {
    const onPage = await lawforumPageFileIds(c).catch(() => new Set<number>());
    const shared = [...fileIds].filter((id) => onPage.has(id)).length;
    if (shared > 0) return { lawforumId: c.id, sharedFiles: shared };
  }
  return { lawforumId: null, sharedFiles: 0 };
}
