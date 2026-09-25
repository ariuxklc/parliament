import { htmlText } from "./legalinfo.ts";

/**
 * Parser for Parliament's register of passed acts — www.parliament.mn/laws/ (7,000+ laws and
 * resolutions with their dates). Server-rendered; filters: keywords, tid (1 law, 2 resolution),
 * sort (ConfirmedOnDescending …), page. Verified 2026-09-25. Pure, tested offline.
 */

export interface PassedAct {
  id: string;
  title: string;
  date: string | null; // YYYY-MM-DD as printed in the register
  kind: string | null; // "Бие даасан хууль", "Нэмэлт, өөрчлөлт оруулах тухай хууль", "Хүчинтэй тогтоол" …
  url: string;
  fileUrl: string | null;
}

export const REGISTER_BASE = "https://www.parliament.mn";

export function parseRegister(html: string): { total: number | null; items: PassedAct[] } {
  const total = /Нийт:\s*(\d+)|&#x41D;&#x438;&#x439;&#x442;:\s*(\d+)/.exec(html);
  const items: PassedAct[] = [];
  const chunks = html.split(/<div class="entry col-/).slice(1);
  for (const chunk of chunks) {
    const link = /<h3[^>]*>\s*<a href="\/laws\/(\d{1,9})\/?"[^>]*>([\s\S]*?)<\/a>/.exec(chunk);
    if (!link) continue;
    const meta = /<span>\s*(\d{4}-\d{2}-\d{2})\s*[—-]\s*<\/span>\s*<a class="category"[^>]*>([\s\S]*?)<\/a>/.exec(chunk);
    const file = /href="(https:\/\/www\.parliament\.mn\/files\/[a-f0-9]{16,64}\/\?d=1)"/.exec(chunk);
    items.push({
      id: link[1],
      title: htmlText(link[2]),
      date: meta?.[1] ?? null,
      kind: meta ? htmlText(meta[2]) : null,
      url: `${REGISTER_BASE}/laws/${link[1]}/`,
      fileUrl: file?.[1] ?? null,
    });
  }
  return { total: total ? Number(total[1] ?? total[2]) : null, items };
}
