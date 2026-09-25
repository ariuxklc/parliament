import { extractDocx } from "./docx.ts";
import { extractPdfText, pdfBlocks } from "./pdf.ts";
import { hasZipEntry } from "./zip.ts";
import { sniff } from "./official-file.ts";
import { blocksText, textStats, type ExtractedBlock } from "./structure.ts";

/**
 * One entry point for official files: sniff → DOCX parser or PDF text layer → quality check.
 *
 *   PDF → native text → usable? ── yes → "ok" (method "native")
 *                               └─ no  → "needs-ocr" (scan or broken font map; OCR is a separate, opt-in step)
 *
 * Survey of 43 real PDFs from 2025–2026 projects (2026-09-25): only 8 have a usable text layer — most are
 * scans (SKM_… scanner files, signed letters). DOCX files always have text. See HANDOFF.md.
 */

export const EXTRACTOR_VERSION = 1;

export type ExtractionStatus = "ok" | "needs-ocr" | "unsupported" | "failed";

export interface ExtractionResult {
  status: ExtractionStatus;
  method: "native" | "ocr" | null;
  format: "pdf" | "docx" | "doc" | "other";
  pages: number | null;
  chars: number;
  blocks: ExtractedBlock[];
  note: string | null;
}

const MIN_LETTERS = 300;
const MIN_LETTERS_PER_PAGE = 120;

/** Is a PDF text layer good enough to read, or is it a scan / garbled font map? */
export function judgePdfText(pages: string[]): { usable: boolean; reason: string | null } {
  const text = pages.join("\n");
  const s = textStats(text);
  const perPage = s.letters / Math.max(1, pages.length);
  if (s.letters < MIN_LETTERS || perPage < MIN_LETTERS_PER_PAGE) return { usable: false, reason: "Текст давхарга алга (сканнердсан байж магадгүй)" };
  if (s.mojibake / s.letters > 0.2 || s.replacement / s.letters > 0.05) return { usable: false, reason: "Фонтын кодчилол эвдэрхий, текст танигдахгүй" };
  const emptyPages = pages.filter((p) => (p.match(/\p{L}/gu)?.length ?? 0) < 40).length;
  if (emptyPages / pages.length > 0.6) return { usable: false, reason: "Ихэнх хуудас сканнердсан" };
  return { usable: true, reason: null };
}

export async function extractDocument(bytes: Uint8Array): Promise<ExtractionResult> {
  const kind = sniff(bytes);
  try {
    if (kind === "zip") {
      if (!hasZipEntry(bytes, "word/document.xml")) {
        return { status: "unsupported", method: null, format: "other", pages: null, chars: 0, blocks: [], note: "DOCX биш архив файл" };
      }
      const blocks = extractDocx(bytes);
      const chars = blocksText(blocks).length;
      if (chars < 40) return { status: "failed", method: "native", format: "docx", pages: null, chars, blocks: [], note: "Файлд текст алга" };
      return { status: "ok", method: "native", format: "docx", pages: null, chars, blocks, note: null };
    }
    if (kind === "pdf") {
      const { pages } = await extractPdfText(bytes);
      const verdict = judgePdfText(pages);
      if (!verdict.usable) return { status: "needs-ocr", method: null, format: "pdf", pages: pages.length, chars: 0, blocks: [], note: verdict.reason };
      const blocks = pdfBlocks(pages);
      return { status: "ok", method: "native", format: "pdf", pages: pages.length, chars: blocksText(blocks).length, blocks, note: null };
    }
    if (kind === "ole") return { status: "unsupported", method: null, format: "doc", pages: null, chars: 0, blocks: [], note: "Хуучин .doc формат одоогоор уншигдахгүй" };
    return { status: "unsupported", method: null, format: "other", pages: null, chars: 0, blocks: [], note: "Дэмжигдээгүй файлын төрөл" };
  } catch (err) {
    return {
      status: "failed",
      method: null,
      format: kind === "pdf" ? "pdf" : kind === "zip" ? "docx" : "other",
      pages: null,
      chars: 0,
      blocks: [],
      note: `Файлыг уншиж чадсангүй (${err instanceof Error ? err.message.slice(0, 80) : "алдаа"})`,
    };
  }
}
