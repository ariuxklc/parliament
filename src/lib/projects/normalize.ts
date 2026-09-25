/**
 * Raw d.parliament.mn records → SubmittedProject. Pure (no network, no Node APIs) so it runs in
 * `node --test`, the offline processing script and Next alike.
 */

import type { InitiatorGroup, ProjectDocument, ProjectFileType, ProjectInitiator, SubmittedProject } from "./types.ts";

export const LAWFORUM_ORIGIN = "https://lawforum.parliament.mn";
export const DPARLIAMENT_SITE = "https://d.parliament.mn";

/* ---------------------------------------------------------------- raw payload (fields we read) */

export interface RawTsan {
  id: string;
  name: string | null;
  name1: string | null;
  parentId: string | null;
  jdata?: { ovog?: string | null } | null;
}

export interface RawAttachmentFile {
  title: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
}

export interface RawAttachmentGroup {
  files?: RawAttachmentFile[] | null;
  category?: { id?: string | number | null; title?: string | null } | null;
}

export interface RawTusul {
  id: string;
  type: string;
  name: string | null;
  name1: string | null;
  lawDate: string | null;
  publishDate: string | null;
  lawmakerUpdatedAt?: string | null;
  updatedAt?: string | null;
  jdata?: { team?: string[] | null; attachments?: RawAttachmentGroup[] | null } | null;
  creator?: RawTsan | null;
}

/* ---------------------------------------------------------------- helpers */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isProjectId = (v: string) => UUID.test(v);

/** Initiator category ids → official names (d.parliament.mn `/content/tree?type=TSAN_CAT`, 2026-09-25). */
export const INITIATOR_GROUPS: Record<string, InitiatorGroup> = {
  "b348435e-ab9a-4713-80af-9229380b67e4": "Засгийн газар",
  "ba8970de-3012-4c5b-b38d-88138769b87f": "УИХ-ын гишүүд",
  "221ad3ec-4013-4aea-9f4e-cbd4cb01c15a": "Ерөнхийлөгч",
  "68d0e8a1-73f5-4933-bb29-d5ee1607adef": "Бусад",
};

// NFC: file names uploaded from macOS arrive decomposed ("й" = "и" + U+0306), which breaks matching.
const clean = (v: string | null | undefined) => (v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

/** "2026-09-11T08:00:00.000Z" → "2026-09-11" in Ulaanbaatar time (UTC+8, no DST). */
export function ubDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + 8 * 3600_000).toISOString().slice(0, 10);
}

const UPPER = /^[^a-zа-яөүё]*$/;

/** "БАТ-ЭРДЭНЭ" → "Бат-Эрдэнэ" (member names are published in upper case). */
function nameCase(v: string): string {
  return v
    .toLocaleLowerCase("mn")
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("mn"));
}

export function toInitiator(t: RawTsan | null | undefined): ProjectInitiator | null {
  if (!t) return null;
  const raw = clean(t.name);
  if (!raw) return null;
  const group = (t.parentId && INITIATOR_GROUPS[t.parentId]) || null;
  const role = clean(t.name1) || null;
  let name = raw;
  if (group === "УИХ-ын гишүүд" && UPPER.test(raw)) {
    const ovog = clean(t.jdata?.ovog);
    name = `${ovog ? `${ovog[0].toLocaleUpperCase("mn")}.` : ""}${nameCase(raw)}`;
  }
  return { name, role, group };
}

function fileTypeOf(filename: string, mime: string | null): ProjectFileType {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(filename)?.[1]?.toLowerCase() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "doc" || mime === "application/msword") return "doc";
  if (ext === "xlsx" || ext === "xls" || (mime ?? "").includes("spreadsheet")) return "xlsx";
  if (/^(jpe?g|png|gif|webp)$/.test(ext) || (mime ?? "").startsWith("image/")) return "image";
  return "other";
}

/** Only LawForum's own file paths are accepted: "/files/{id}/" with an optional "?d=1". */
const FILE_PATH = /^\/files\/(\d{1,9})\/(?:\?d=1)?$/;

export function lawforumFileUrls(fileId: number) {
  return { officialUrl: `${LAWFORUM_ORIGIN}/files/${fileId}/?d=1`, viewUrl: `${LAWFORUM_ORIGIN}/files/${fileId}/` };
}

/** "Өргөн мэдүүлэх -Үзэл баримтлал" → ["Өргөн мэдүүлэх", "Үзэл баримтлал"]. */
export function splitCategory(title: string): { step: string; category: string } {
  const t = clean(title);
  const i = t.indexOf(" -");
  if (i <= 0) return { step: "", category: t };
  return { step: t.slice(0, i).trim(), category: t.slice(i + 2).trim() };
}

export function toDocuments(groups: RawAttachmentGroup[] | null | undefined): ProjectDocument[] {
  const out: ProjectDocument[] = [];
  const seen = new Set<number>();
  for (const g of groups ?? []) {
    const categoryTitle = clean(g.category?.title);
    const categoryId = clean(String(g.category?.id ?? ""));
    const { step, category } = splitCategory(categoryTitle);
    for (const f of g.files ?? []) {
      const m = FILE_PATH.exec(clean(f.fileUrl));
      if (!m) continue; // files hosted anywhere else are not treated as official project files
      const fileId = Number(m[1]);
      if (seen.has(fileId)) continue;
      seen.add(fileId);
      const filename = clean(f.fileName) || `file-${fileId}`;
      const mime = clean(f.fileType) || null;
      out.push({
        fileId,
        categoryId,
        categoryTitle,
        step,
        category: category || "Бусад",
        filename,
        title: clean(f.title) || null,
        fileType: fileTypeOf(filename, mime),
        mime,
        ...lawforumFileUrls(fileId),
      });
    }
  }
  return out;
}

export function normalizeProject(raw: RawTusul): SubmittedProject | null {
  if (!raw || raw.type !== "TUSUL" || !isProjectId(raw.id)) return null;
  const title = clean(raw.name);
  if (!title) return null;
  const date = ubDate(raw.lawDate) ?? ubDate(raw.publishDate);
  return {
    id: raw.id,
    title,
    type: clean(raw.name1) || null,
    date,
    year: date ? Number(date.slice(0, 4)) : null,
    initiator: toInitiator(raw.creator),
    coInitiatorCount: Array.isArray(raw.jdata?.team) ? raw.jdata!.team!.filter((x) => typeof x === "string").length : 0,
    documents: toDocuments(raw.jdata?.attachments),
    officialUrl: `${DPARLIAMENT_SITE}/tusul/${raw.id}`,
  };
}

/** Title key used to find candidate records in other official systems (never a link on its own). */
export function titleKey(title: string): string {
  return title
    .toLocaleLowerCase("mn")
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-яөү]+/g, " ")
    .trim();
}

/**
 * The subject of a title, as the Parliament bill bulletin and d.parliament.mn both name it. The bulletin
 * appends package notes ("… тухай хуулийн төсөл болон хамт өргөн мэдүүлсэн хуулийн төслүүд (3)
 * /Анхдагч хуулийн төсөл/"), d.parliament.mn sometimes ends with "… тухай хууль". Both sides are reduced
 * the same way; callers must still require a close date and a unique match.
 */
export function coreTitleKey(title: string): string {
  return titleKey(title.replace(/\/[^/]*\//g, " ").replace(/\(\s*\d+\s*\)/g, " "))
    // (`\b` does not work for Cyrillic in JS regexes, so the word end is spelled out)
    .replace(/\s+(?:хуулийн|тогтоолын)\s+төс(?:өл|лүүд|лийг|лийн)(?=\s|$).*$/u, "")
    .replace(/\s+(?:хууль|төсөл)$/u, "")
    .trim();
}
