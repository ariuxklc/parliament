/**
 * Client for the JSON backend of d.parliament.mn ("ЦАХИМ ПАРЛАМЕНТ"), the official site that lists
 * "Өргөн мэдүүлсэн төслүүд" with their official attachments.
 *
 * Found by reading the site's own front-end bundle (2026-09-25) — its pages call these endpoints directly:
 *   POST https://api-d.parliament.mn/tusul/tusulList   {appId, parentId, page, limit, orderBy, orderDir}  → {count, list}
 *   POST https://api-d.parliament.mn/tusul/read        {appId, id, type:"TUSUL"}                            → one project
 *   GET  https://api-d.parliament.mn/content/tusulTeam ?appId&id                                            → co-initiators
 * No credentials are needed. `parentId` 6101970e-… is the site's «Өргөн мэдүүлсэн төслүүд» list
 * (the other list, eb5c6c00-…, is «Боловсруулж буй төслүүд»). Attachments are LawForum file paths
 * ("/files/{id}/?d=1"), the same file ids LawForum's own bill pages link to.
 *
 * Read-only by construction: fixed host, fixed paths, ids validated before any request.
 * No `server-only` import so the offline processing script can use it; it holds no secrets.
 */

import type { RawTsan, RawTusul } from "./normalize.ts";
import { isProjectId } from "./normalize.ts";

const API = "https://api-d.parliament.mn";
const APP_ID = "56cc90a2-83a0-4e1f-994d-7fdebfdfbf68";
export const SUBMITTED_LIST_ID = "6101970e-2fb0-4394-8113-db13d7374fb6";
const PAGE_SIZE = 100;

export class DParliamentError extends Error {
  status: number | undefined;
  constructor(status: number | undefined, message: string) {
    super(message);
    this.name = "DParliamentError";
    this.status = status;
  }
}

async function call<T>(method: "GET" | "POST", path: string, payload: Record<string, string>, timeoutMs: number): Promise<T> {
  const url = new URL(path, API);
  const init: RequestInit = {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (method === "GET") for (const [k, v] of Object.entries(payload)) url.searchParams.set(k, v);
  else init.body = JSON.stringify(payload);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network error";
    throw new DParliamentError(undefined, `d.parliament.mn: ${reason}`);
  }
  if (!res.ok) throw new DParliamentError(res.status, `d.parliament.mn: HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new DParliamentError(res.status, "d.parliament.mn: malformed JSON");
  }
}

interface ListPage {
  count: number;
  list: RawTusul[];
}

function listPage(page: number): Promise<ListPage> {
  return call<ListPage>(
    "POST",
    "/tusul/tusulList",
    { appId: APP_ID, parentId: SUBMITTED_LIST_ID, page: String(page), limit: String(PAGE_SIZE), orderBy: "publishDate", orderDir: "DESC" },
    40_000,
  );
}

/** Every project in «Өргөн мэдүүлсэн төслүүд» (≈350 records, ≈2 MB in 4 requests). */
export async function fetchSubmittedProjects(): Promise<RawTusul[]> {
  const first = await listPage(1);
  const pages = Math.min(20, Math.ceil((first.count ?? 0) / PAGE_SIZE));
  const rest: ListPage[] = [];
  // two at a time — polite to the official server
  for (let p = 2; p <= pages; p += 2) {
    rest.push(...(await Promise.all([p, p + 1].filter((n) => n <= pages).map(listPage))));
  }
  const all = [first, ...rest].flatMap((pg) => (Array.isArray(pg.list) ? pg.list : []));
  return [...new Map(all.map((x) => [x.id, x])).values()];
}

/** One project, or null when the id is unknown or is not in the submitted-projects list. */
export async function fetchProject(id: string): Promise<RawTusul | null> {
  if (!isProjectId(id)) return null;
  try {
    const raw = await call<RawTusul & { parentId?: string }>("POST", "/tusul/read", { appId: APP_ID, id, type: "TUSUL" }, 20_000);
    if (!raw || raw.id !== id || raw.type !== "TUSUL" || raw.parentId !== SUBMITTED_LIST_ID) return null;
    return raw;
  } catch (err) {
    if (err instanceof DParliamentError && (err.status === 400 || err.status === 404)) return null;
    throw err;
  }
}

/** Additional initiators of a project (the main initiator is the project's `creator`). */
export async function fetchProjectTeam(id: string): Promise<RawTsan[]> {
  if (!isProjectId(id)) return [];
  const res = await call<RawTsan[]>("GET", "/content/tusulTeam", { appId: APP_ID, id }, 15_000);
  return Array.isArray(res) ? res.filter((t) => t && typeof t.id === "string") : [];
}
