/**
 * Parsers for legalinfo.mn — Эрх зүйн мэдээллийн нэгдсэн систем (the official consolidated texts of
 * laws in force). Pure: no network, so they are tested offline against saved pages.
 *
 * Verified 2026-09-25:
 *  - Search: POST /mn/advsearchList (title hits) and /mn/advsearchList/5 (full-text hits with snippets).
 *    Both return {Html}: accordion groups per act type, each hit linking /mn/detail?lawId=N, with
 *    "Батлагдсан огноо" (adopted) and "Дагаж мөрдөх огноо" (in effect from).
 *  - Law page: GET /mn/detail?lawId=N, server-rendered. Every heading/paragraph is
 *    `<div class="w-100 pull-left responsive_mobile" data-parentid=".." id="..">`; paragraphs point to their
 *    article. Amendments are noted inline: "/Энэ хэсэгт 2025 оны 07 дугаар сарын 09-ний өдрийн хуулиар нэмэлт оруулсан./".
 */

export interface LawSearchHit {
  lawId: string;
  title: string;
  actType: string; // group label, e.g. "Монгол Улсын хууль"
  adopted: string | null; // YYYY-MM-DD
  effective: string | null; // YYYY-MM-DD
  snippet: string | null; // full-text hits only
}

export interface LawArticle {
  id: string;
  number: string; // "14.7"
  heading: string; // "14.7 дугаар зүйл.Замын хөдөлгөөний аюулгүй байдлын тухай хууль зөрчих"
  chapter: string;
  /** Text in force. Struck-out (repealed) text is never included. */
  paragraphs: string[];
  /** Amendment notes attached to this article's paragraphs, verbatim. */
  notes: string[];
  /** The whole article is struck out on legalinfo.mn (repealed); it stays on the page for history only. */
  repealed: boolean;
  /** Paragraphs of this article that are struck out (repealed). */
  repealedParagraphs: number;
  /** Every recorded change to this article, with the wording it concerns. */
  changes: LawChange[];
}

export interface LawChange {
  date: string | null; // YYYY-MM-DD of the amending law
  kind: "added" | "amended" | "repealed" | "other";
  note: string; // verbatim note, e.g. "/Энэ хэсэгт 2025 оны 07 дугаар сарын 09-ний өдрийн хуулиар нэмэлт оруулсан./"
  /** Current wording of the changed paragraph, or the struck-out wording when it was repealed. */
  text: string;
}

export interface LawDocument {
  title: string;
  /** The dateline printed under the title, e.g. "2017 оны 5 дугаар сарын 11-ний өдөр". */
  dateline: string | null;
  articles: LawArticle[];
  /** Top-level text that is not inside an article (preamble, standalone clauses). */
  loose: string[];
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => cp(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => cp(Number(dec)))
    .replace(/&quot;|&ldquo;|&rdquo;|&bdquo;/g, '"')
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&ndash;|&mdash;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&#39;|&apos;|&lsquo;|&rsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function cp(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

export function htmlText(fragment: string): string {
  return decodeHtml(fragment.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const date = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

export function parseLawSearch(html: string): LawSearchHit[] {
  const hits: LawSearchHit[] = [];
  // Each accordion group: <a class="uk-accordion-title"><span>ACT TYPE</span><span>(N)</span></a> … hits …
  const groups = html.split(/<li[^>]*>\s*<a class="uk-accordion-title"/).slice(1);
  for (const group of groups) {
    const actType = htmlText(/<span[^>]*>([\s\S]*?)<\/span>/.exec(group)?.[1] ?? "");
    const items = group.split(/<div class="uk-width-1-1 uk-width-10-12@m">/).slice(1);
    for (const item of items) {
      const link = /href="[^"]*detail\?lawId=(\d{1,20})[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(item);
      if (!link) continue;
      const body = /class="lcell body-uk"[^>]*>([\s\S]*?)<\/div>/.exec(item)?.[1] ?? "";
      const snippet = htmlText(body.replace(/<b>\s*(?:&lt;|<){2}\.\.\.\s*<\/b>/g, "…").replace(/<b>\s*\.\.\.(?:&gt;|>){2}\s*<\/b>/g, "…"))
        .replace(/<<\.\.\.|\.\.\.>>/g, "…")
        .trim();
      const adopted = /title="Батлагдсан огноо"[\s\S]*?class="date-custom">([^<]+)</.exec(item)?.[1];
      const effective = /title="Дагаж мөрдөх огноо"[\s\S]*?class="date-custom">([^<]+)</.exec(item)?.[1];
      hits.push({ lawId: link[1], title: htmlText(link[2]), actType, adopted: date(adopted), effective: date(effective), snippet: snippet || null });
    }
  }
  return hits;
}

const ARTICLE = /^(\d+(?:\.\d+)*)\s*(?:дугаар|дүгээр|дахь|дэх|-р)\s*зүйл/iu;
const CHAPTER = /(?:БҮЛЭГ|АНГИ)$/u;
const NOTE_P = /<p[^>]*text-decoration:\s*underline[^>]*>([\s\S]*?)<\/p>/gi;
/** A whole block that is an amendment note: "/Энэ зүйлийг 2015 оны … хуулиар хүчингүй болсонд тооцсон/". */
const NOTE_TEXT = /^\/.{8,400}(?:хуулиар|тогтоолоор|шийдвэрээр).{0,160}\/?$/u;
const STRUCK = /<(s|strike|del)\b[^>]*>[\s\S]*?<\/\1>/gi;
const MAX_BLOCKS = 12_000;

export function parseLawPage(html: string): LawDocument {
  const titleTag = htmlText(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const blocks: { id: string; parent: string; text: string; notes: string[]; struck: boolean }[] = [];
  const re = /<div class="w-100 pull-left responsive_mobile[^"]*"[^>]*?data-parentid="(\d*)"[^>]*?\sid="(\d+)"[^>]*>([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && blocks.length < MAX_BLOCKS) {
    const inner = m[3];
    const notes = [...inner.matchAll(NOTE_P)].map((n) => htmlText(n[1])).filter(Boolean);
    const withoutNotes = inner.replace(NOTE_P, " ");
    // legalinfo.mn keeps repealed provisions on the page, struck out. They are history, not law in force.
    const hadStruck = STRUCK.test(withoutNotes);
    STRUCK.lastIndex = 0;
    let text = htmlText(withoutNotes.replace(STRUCK, " "));
    const struck = hadStruck && !text;
    if (struck) text = htmlText(withoutNotes);
    if (NOTE_TEXT.test(text)) {
      notes.push(text);
      text = "";
    }
    if (text || notes.length) blocks.push({ id: m[2], parent: m[1], text, notes, struck });
  }

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const articles: LawArticle[] = [];
  const articleOf = new Map<string, LawArticle>();
  const loose: string[] = [];
  let chapter = "";
  let dateline: string | null = null;
  let title = "";

  let lastArticle: LawArticle | undefined;
  let lastText = "";
  const record = (article: LawArticle | undefined, notes: string[], text: string) => {
    if (!article) return;
    article.notes.push(...notes);
    for (const note of notes) article.changes.push({ date: noteDate(note), kind: noteKind(note), note, text: text || article.heading });
  };
  for (const b of blocks) {
    if (!b.text) {
      // A note-only block follows the paragraph (or article) it annotates.
      record(articleOf.get(b.parent) ?? lastArticle, b.notes, lastText);
      continue;
    }
    lastText = b.text;
    if (!b.parent) {
      const num = ARTICLE.exec(b.text);
      if (num) {
        const article: LawArticle = { id: b.id, number: num[1], heading: b.text, chapter, paragraphs: [], notes: [], repealed: b.struck, repealedParagraphs: 0, changes: [] };
        articles.push(article);
        articleOf.set(b.id, article);
        lastArticle = article;
        record(article, b.notes, b.text);
        continue;
      }
      if (!dateline && /^\d{4}\s*оны\s/.test(b.text)) dateline = b.text;
      else if (CHAPTER.test(b.text) && b.text.length < 60) chapter = b.text;
      else if (chapter && /^[А-ЯӨҮЁ\s,.\-"«»]+$/u.test(b.text) && b.text.length < 160 && !articles.length) chapter = `${chapter} — ${b.text}`;
      else if (!title && /^[А-ЯӨҮЁ\s,.\-"«»/]+$/u.test(b.text) && !/МОНГОЛ УЛСЫН ХУУЛЬ|УЛААНБААТАР/u.test(b.text)) title = b.text;
      else if (!/^МОНГОЛ УЛСЫН (?:ХУУЛЬ|ИХ ХУРЛЫН ТОГТООЛ)$|^Улаанбаатар хот$/u.test(b.text)) loose.push(b.text);
      continue;
    }
    // Walk up to the owning article (paragraphs can nest: article → paragraph → sub-item).
    let parent = byId.get(b.parent);
    let owner = articleOf.get(b.parent);
    for (let hops = 0; !owner && parent && hops < 6; hops++) {
      owner = articleOf.get(parent.parent);
      parent = byId.get(parent.parent);
    }
    if (owner) {
      if (b.struck) owner.repealedParagraphs++;
      else owner.paragraphs.push(b.text);
      record(owner, b.notes, b.text);
      articleOf.set(b.id, owner);
    } else if (!b.struck) loose.push(b.text);
  }

  return { title: title || titleTag.replace(/\s*[-|].*$/, ""), dateline, articles, loose: loose.slice(0, 40) };
}

const MONTHS_RE = /(\d{4})\s*оны\s*(\d{1,2})\s*(?:дугаар|дүгээр|-р)?\s*сарын\s*(\d{1,2})/u;

function noteDate(note: string): string | null {
  const m = MONTHS_RE.exec(note);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

function noteKind(note: string): LawChange["kind"] {
  if (/хүчингүй\s*болсонд\s*тооцсон/iu.test(note)) return "repealed";
  if (/нэмэлт\s*оруулсан|нэмсэн/iu.test(note)) return "added";
  if (/өөрчлөлт\s*оруулсан|өөрчилсөн|найруулсан/iu.test(note)) return "amended";
  return "other";
}

/** Amendment dates found in the notes ("…2025 оны 07 дугаар сарын 09-ний өдрийн хуулиар…") with counts. */
export function amendmentHistory(doc: LawDocument): { date: string; changes: number }[] {
  const counts = new Map<string, number>();
  for (const a of doc.articles) {
    for (const c of a.changes) if (c.date) counts.set(c.date, (counts.get(c.date) ?? 0) + 1);
  }
  return [...counts.entries()].map(([d, changes]) => ({ date: d, changes })).sort((a, b) => b.date.localeCompare(a.date));
}

/** Changes made by laws dated with the given prefix ("2026", "2025-07", "2025-07-09"). */
export function changesIn(doc: LawDocument, datePrefix: string): (LawChange & { article: string })[] {
  return doc.articles.flatMap((a) => a.changes.filter((c) => c.date?.startsWith(datePrefix)).map((c) => ({ ...c, article: a.heading })));
}
