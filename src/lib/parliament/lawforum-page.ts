/**
 * Parser for public LawForum bill pages (lawforum.parliament.mn/project/{id}/ and /draft/{id}/).
 *
 * The LawForum API has metadata only (its `description` is null), but the public page is server-rendered
 * with the full proposed text. Verified 2026-09-25 on projects 11151 and 11173:
 *  - every heading and clause is a `<div class="refDiv" id="{anchor}">`; `#{anchor}` scrolls to it;
 *  - the first refDiv is the bill title, article headings look like "3 ДУГААР ЗҮЙЛ. ...";
 *  - official attachments are grouped under "Төслийн файлууд" (`tb-accordian-title` + `/files/{id}/?d=1`).
 * Text is entity-encoded (&#x4E8;…), so it is decoded here. Pure: no network, no Node APIs.
 */

export interface LawForumClause {
  anchor: string;
  /** "1.1", "5.1.6" or "" for unnumbered text. */
  number: string;
  /** Heading of the article this clause belongs to, e.g. "1 ДҮГЭЭР ЗҮЙЛ ХУУЛИЙН ЗОРИЛГО". */
  article: string;
  text: string;
  isHeading: boolean;
}

export interface LawForumFile {
  label: string;
  path: string; // "/files/17930/?d=1" — always a LawForum-relative path
}

export interface LawForumDocument {
  title: string;
  clauses: LawForumClause[];
  files: LawForumFile[];
}

const MAX_CLAUSES = 600;
const MAX_CLAUSE_CHARS = 1_500;

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function htmlToText(fragment: string): string {
  return decodeEntities(fragment.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    // strip control characters (keep normal whitespace)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// `\b` does not work for Cyrillic in JS regexes, so the boundary is spelled out.
const ARTICLE_HEADING = /^\d+\s*(?:дугаар|дүгээр|дахь|дэх)?\s*зүйл(?:[\s.:]|$)/iu;
const NUMBERED = /^\d/;

export function parseLawForumPage(html: string): LawForumDocument {
  const clauses: LawForumClause[] = [];
  // Text of a refDiv runs until its nested comment box or its closing tag.
  const re = /<div class="refDiv"[^>]*\bid="(\d{1,12})"[^>]*>([\s\S]*?)(?=<div class="comment-action-box"|<\/div>)/g;
  let article = "";
  let title = "";
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && clauses.length < MAX_CLAUSES) {
    const text = htmlToText(match[2]).slice(0, MAX_CLAUSE_CHARS);
    if (!text) continue;
    // The bill title is the first un-numbered block (amendment bills may have an empty title block).
    if (!title && !clauses.length && !NUMBERED.test(text)) {
      title = text;
      continue;
    }
    // "3 ДУГААР ЗҮЙЛ. ХУУЛИЙН ҮЙЛЧЛЭХ ХҮРЭЭ" is a heading; amendment articles ("1 дүгээр зүйл. …гэж өөрчилсүгэй.") are content.
    const isHeading = ARTICLE_HEADING.test(text) && text.length < 200 && !/[.;:]$/.test(text);
    if (isHeading) article = text;
    const number = /^(\d+(?:\.\d+)+)\.?\s/.exec(text)?.[1] ?? "";
    clauses.push({ anchor: match[1], number, article: isHeading ? text : article, text, isHeading });
  }

  const files: LawForumFile[] = [];
  const filesStart = html.indexOf("Төслийн файлууд");
  if (filesStart >= 0) {
    const filesEnd = html.indexOf("Төслийн хэрэглэгчид", filesStart);
    const block = html.slice(filesStart, filesEnd > filesStart ? filesEnd : undefined);
    const groupRe = /<div class="tb-accordian-title">([\s\S]*?)<span|href="(\/files\/\d{1,10}\/\?d=1)"/g;
    let label = "";
    const seen = new Set<string>();
    while ((match = groupRe.exec(block)) && files.length < 60) {
      if (match[1] !== undefined) label = htmlToText(match[1]);
      else if (match[2] && !seen.has(match[2])) {
        seen.add(match[2]);
        files.push({ label: label || "Төслийн файл", path: match[2] });
      }
    }
  }

  return { title, clauses, files };
}
