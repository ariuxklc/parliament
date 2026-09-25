import "server-only";
import { serverEnv } from "../env";
import { fetchJson, mapLimit, ttlCache } from "../http";

/**
 * LawForum API — public, read-only REST API (Swagger: /LawForumAPI/docs/).
 *
 *   GET /api/v1/projects?page&pageSize(≤100)&typeId&categoryId&search   → paged list
 *   GET /api/v1/projects/{id}                                           → detail (+ createdOnUtc, updatedOnUtc)
 *   GET /api/v1/project-types                                           → 1 Хууль, 2 УИХ-ын тогтоол, 4 Тайлан мэдээлэл, 5 Цэцийн дүгнэлт, 6 Ерөнхийлөгчийн хориг
 *   GET /api/v1/project-categories                                      → Бие даасан, Нэмэлт өөрчлөлт, Хүчингүй болгосон, Бусад
 *
 * Findings (2026-09-25):
 *  - The list cannot be filtered by date, so we page through everything (≈11 requests) and cache it.
 *  - `status` 1 = publicly listed on lawforum.parliament.mn; `status` 0 records exist but are not listed there.
 *  - `stage` 0 = drafting / open for comment, 10 = submitted to Parliament.
 *  - `isActive` is false for every record and `description` is null — neither is used.
 *  - Timestamps are UTC without a zone suffix; `publishedOnUtc` is midnight Ulaanbaatar time.
 */

export interface LawForumListItem {
  id: number;
  title: string | null;
  projectNumber: string | null;
  typeId: number;
  typeTitle: string | null;
  categoryId: number;
  categoryTitle: string | null;
  status: number;
  stage: number;
  publishedOnUtc: string | null;
  isActive: boolean;
}

interface LawForumPage {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  items: LawForumListItem[] | null;
}

export interface LawForumDetail extends LawForumListItem {
  description: string | null;
  slugUrl: string | null;
  createdOnUtc: string | null;
  updatedOnUtc: string | null;
  implementFromUtc: string | null;
  isAllowComments: boolean;
}

const LIST_TTL = 60 * 30; // 30 min
const DETAIL_TTL = 60 * 60 * 6; // 6 h — updatedOnUtc rarely changes for older records

const base = () => `${serverEnv.lawforumApiBaseUrl}/api/v1`;

const allCache = ttlCache<LawForumListItem[]>(LIST_TTL * 1000);

/** Every proposal in LawForum (≈1,000 records). Cached in-process and in the fetch cache. */
export function getAllProposals(): Promise<LawForumListItem[]> {
  return allCache("all", async () => {
    const first = await fetchJson<LawForumPage>("LawForum", `${base()}/projects?page=1&pageSize=100`, { revalidate: LIST_TTL, timeoutMs: 15_000 });
    const pages = Array.from({ length: Math.max(0, (first.totalPages ?? 1) - 1) }, (_, i) => i + 2);
    const rest = await mapLimit(pages, 4, (p) =>
      fetchJson<LawForumPage>("LawForum", `${base()}/projects?page=${p}&pageSize=100`, { revalidate: LIST_TTL, timeoutMs: 15_000 }),
    );
    const items = [first, ...rest].flatMap((pg) => pg.items ?? []);
    // de-duplicate in case records shift between pages while paging
    return [...new Map(items.map((x) => [x.id, x])).values()];
  });
}

export function getProposalDetail(id: number): Promise<LawForumDetail> {
  return fetchJson<LawForumDetail>("LawForum", `${base()}/projects/${id}`, { revalidate: DETAIL_TTL, timeoutMs: 8_000 });
}
