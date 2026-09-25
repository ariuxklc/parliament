import { headingLevel, tidy, type ExtractedBlock } from "./structure.ts";

/**
 * PDF → per-page text with pdf.js (via `unpdf`, a dependency-free serverless build).
 * Only the native text layer is read here; scanned pages come back empty and are reported by
 * extract.ts as "needs OCR" — nothing is guessed.
 */

export interface PdfText {
  pages: string[];
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  // pdf.js may transfer/detach the buffer it is given, so it gets its own copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { disableFontFace: true });
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return { pages: (Array.isArray(text) ? text : [text]).map((p) => tidy(p ?? "")) };
  } finally {
    // The proxy's teardown API differs between pdf.js builds; free memory whichever way is available.
    const p = pdf as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void>; loadingTask?: { destroy?: () => Promise<void> } };
    await (p.loadingTask?.destroy?.() ?? p.destroy?.() ?? p.cleanup?.())?.catch(() => undefined);
  }
}

/** Page texts → blocks, keeping page numbers so a citation can point at "х. 3". */
export function pdfBlocks(pages: string[]): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  pages.forEach((pageText, i) => {
    const page = i + 1;
    // pdf.js joins lines of one paragraph with single newlines; blank lines separate paragraphs.
    const lines = pageText.split("\n").map((l) => l.trim());
    let buf: string[] = [];
    const flush = () => {
      const text = buf.join(" ").replace(/\s+/g, " ").trim();
      buf = [];
      if (!text) return;
      const level = headingLevel(text);
      blocks.push(level ? { kind: "heading", text, level, page } : { kind: "paragraph", text, page });
    };
    for (const line of lines) {
      if (!line) {
        flush();
        continue;
      }
      // A line that starts an article/section begins a new block even without a blank line.
      if (buf.length && headingLevel(line)) flush();
      buf.push(line);
      if (headingLevel(line) && line.length < 160) flush();
    }
    flush();
  });
  return blocks;
}
