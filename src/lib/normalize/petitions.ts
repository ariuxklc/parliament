import { cleanText } from "../format";

/**
 * Public petitions (Нийтийн өргөдөл) parsed from the petition.parliament.mn list HTML.
 * Deliberately NOT extracted: the petitioner's name and uploaded photo — petitioners are private
 * individuals; the official page (linked) shows them in full context.
 */
export interface PetitionItem {
  number: string; // PN-202608-81671
  title: string;
  kind: string | null; // "Хуулийн төсөл санаачлах талаар санал гаргах"
  date: string | null; // YYYY-MM-DD
  signatures: number;
  goal: number;
  url: string;
}

const PETITION_SITE = "https://petition.parliament.mn";

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parsePetitions(html: string, limit = 4): PetitionItem[] {
  const out: PetitionItem[] = [];
  for (const raw of html.split('<a class="pet-item').slice(1)) {
    const it = raw.replace(/<script[\s\S]*?<\/script>/g, "");
    const id = /href="\/Detail\?id=([0-9a-f-]{36})"/.exec(it)?.[1];
    const number = /(PN-\d{6}-\d+)/.exec(it)?.[1];
    const title = /fw-bold"[^>]*>\s*([\s\S]*?)\s*<\/div>/.exec(it)?.[1];
    const sig = /title="Нийт (\d+) гарын үсэг цуглуулахаас (\d+)-г/.exec(decode(it));
    if (!id || !number || !title || !sig) continue; // skip anything malformed rather than guess
    const kind = /fst-italic">([\s\S]*?)<\/span>/.exec(it)?.[1];
    const date = /fa-calendar[^<]*<\/i>\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(it);
    out.push({
      number,
      title: cleanText(decode(title.replace(/<[^>]+>/g, " "))),
      kind: kind ? cleanText(decode(kind)).replace(/^\d+\.\s*/, "") : null,
      date: date ? `${date[1]}-${date[2]}-${date[3]}` : null,
      goal: Number(sig[1]),
      signatures: Number(sig[2]),
      url: `${PETITION_SITE}/Detail?id=${id}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}
