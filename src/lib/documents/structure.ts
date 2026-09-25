/**
 * Shared document model for extracted official files + structure heuristics for Mongolian legal texts.
 * Pure (no Node APIs).
 */

export type BlockKind = "heading" | "paragraph" | "list" | "table";

export interface ExtractedBlock {
  kind: BlockKind;
  text: string;
  /** Heading level (1 = chapter/section, 2 = article). */
  level?: number;
  /** 1-based page number (PDF only). */
  page?: number;
}

export const ARTICLE = /^\d+\s*(?:дугаар|дүгээр|дахь|дэх|-р)?\s*зүйл\s*[.:]?/iu;
const CHAPTER = /^[А-ЯӨҮЁ-]+(?:ДУГААР|ДҮГЭЭР)\s+БҮЛЭГ\b|^[А-ЯӨҮЁ]+\s+БҮЛЭГ$/u;
const SECTION_WORD = /^(?:нэг|хоёр|гурав|дөрөв|тав|зургаа|долоо|найм|ес|арав)\s*[.:]\s*\S/iu;
const LETTER = /\p{L}/gu;

/** Heading level for a paragraph, or 0. Conservative: body text must not become a heading. */
export function headingLevel(text: string): number {
  const t = text.trim();
  if (!t || t.length > 180) return 0;
  if (CHAPTER.test(t)) return 1;
  if (SECTION_WORD.test(t) && t.length < 160) return 1;
  if (ARTICLE.test(t) && t.length < 160) return 2;
  const letters = t.match(LETTER)?.length ?? 0;
  if (letters >= 4 && t.length < 140 && t === t.toLocaleUpperCase("mn") && /[А-ЯӨҮЁ]/u.test(t)) return 1;
  return 0;
}

/** Collapse whitespace but keep paragraph intent. */
export function tidy(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f­﻿]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function blocksText(blocks: ExtractedBlock[]): string {
  return blocks.map((b) => b.text).join("\n");
}

/** Letters, Cyrillic share and "mojibake" share (CP1251 text decoded as Latin-1: "Ìîíãîë"). */
export function textStats(text: string) {
  const letters = text.match(LETTER)?.length ?? 0;
  const cyrillic = text.match(/[Ѐ-ӿ]/g)?.length ?? 0;
  const mojibake = text.match(/[À-ÿ]/g)?.length ?? 0;
  const replacement = text.match(/�/g)?.length ?? 0;
  return { letters, cyrillic, mojibake, replacement };
}
