import { readZipEntry } from "./zip.ts";
import { headingLevel, tidy, type ExtractedBlock } from "./structure.ts";

/**
 * DOCX → blocks (headings, paragraphs, list items, tables) from word/document.xml.
 * Tracked deletions and field codes are skipped; tables become one block with " | "-separated cells.
 * No dependencies — official DOCX files are plain OOXML.
 */

const TOKEN = /<(\/?)([A-Za-z][\w.-]*:[\w.-]+|[A-Za-z][\w.-]*)([^>]*?)(\/?)>|([^<]+)/g;
const VAL = /\bw:val="([^"]*)"/;

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeChar(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeChar(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

const MAX_BLOCKS = 20_000;

export function parseDocumentXml(xml: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  let para: { text: string; style: string; outline: number | null; list: boolean } | null = null;
  let inText = false;
  let skipDepth = 0; // inside <w:del>, <w:delText>, <w:instrText>
  let tableDepth = 0;
  let rows: string[][] = [];
  let row: string[] | null = null;
  let cell: string[] | null = null;

  const finishPara = () => {
    if (!para) return;
    const text = tidy(para.text);
    const p = para;
    para = null;
    if (!text) return;
    if (tableDepth > 0) {
      cell?.push(text.replace(/\n/g, " "));
      return;
    }
    const styleLevel = /^(?:heading|гарчиг)\s*(\d)$/i.exec(p.style)?.[1];
    const level = p.outline !== null && p.outline < 4 ? p.outline + 1 : styleLevel ? Number(styleLevel) : /^title$/i.test(p.style) ? 1 : headingLevel(text);
    if (level) blocks.push({ kind: "heading", text, level: Math.min(level, 3) });
    else blocks.push({ kind: p.list ? "list" : "paragraph", text });
  };

  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(xml)) && blocks.length < MAX_BLOCKS) {
    const [, closing, tag, attrs, selfClosing, textNode] = m;
    if (textNode !== undefined) {
      if (para && inText && !skipDepth) para.text += decodeXml(textNode);
      continue;
    }
    const open = !closing;
    switch (tag) {
      case "w:p":
        if (open && !selfClosing) {
          finishPara();
          para = { text: "", style: "", outline: null, list: false };
        } else if (!open) finishPara();
        break;
      case "w:pStyle":
        if (para) para.style = VAL.exec(attrs)?.[1] ?? "";
        break;
      case "w:outlineLvl":
        if (para) para.outline = Number(VAL.exec(attrs)?.[1] ?? NaN);
        if (para && Number.isNaN(para.outline)) para.outline = null;
        break;
      case "w:numPr":
        if (para) para.list = true;
        break;
      case "w:t":
        inText = open && !selfClosing;
        break;
      case "w:tab":
        if (para && !skipDepth) para.text += " ";
        break;
      case "w:br":
      case "w:cr":
        if (para && !skipDepth) para.text += "\n";
        break;
      case "w:del":
      case "w:delText":
      case "w:instrText":
      case "mc:Fallback": // text boxes are stored twice (mc:Choice + mc:Fallback)
        if (selfClosing) break;
        skipDepth += open ? 1 : -1;
        if (skipDepth < 0) skipDepth = 0;
        break;
      case "w:tbl":
        if (open) {
          finishPara();
          tableDepth++;
          if (tableDepth === 1) rows = [];
        } else {
          tableDepth = Math.max(0, tableDepth - 1);
          if (tableDepth === 0) {
            const text = rows
              .map((r) => r.filter(Boolean).join(" | "))
              .filter(Boolean)
              .join("\n");
            if (text) blocks.push({ kind: "table", text });
          }
        }
        break;
      case "w:tr":
        if (tableDepth === 1) {
          if (open) row = [];
          else if (row) {
            rows.push(row);
            row = null;
          }
        }
        break;
      case "w:tc":
        if (tableDepth === 1) {
          if (open) cell = [];
          else if (cell) {
            row?.push(cell.join(" "));
            cell = null;
          }
        }
        break;
    }
  }
  finishPara();
  return blocks;
}

export function extractDocx(bytes: Uint8Array): ExtractedBlock[] {
  const xml = readZipEntry(bytes, "word/document.xml");
  if (!xml) throw new Error("word/document.xml missing");
  return parseDocumentXml(xml.toString("utf8"));
}
