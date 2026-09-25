/**
 * Which official documents (and which parts of them) the model sees. Pure — no network, no Node APIs.
 *
 *   official files → extracted blocks → sections (≤1,600 chars, split at headings)
 *                  → per-role budget, most useful sections first → excerpts "D{doc}.{n}"
 *
 * The whole archive is never concatenated: a project can have 15 files and 300+ pages. Roles are ranked
 * by how much they say about *what the project proposes and why* (Parliament's own submission package):
 * the draft itself, then Үзэл баримтлал, Танилцуулга, the needs assessment, impact / cost studies.
 */

import type { ExtractedBlock } from "../documents/structure.ts";
import type { ProjectDocument } from "../projects/types.ts";
import type { BriefExcerpt, DocRole } from "./types.ts";

export const ROLE_LABEL: Record<DocRole, string> = {
  draft: "Төслийн эх бичвэр",
  concept: "Үзэл баримтлал",
  introduction: "Танилцуулга",
  needs: "Хэрэгцээ шаардлагын судалгаа",
  impact: "Үр нөлөөний үнэлгээ",
  cost: "Зардлын тооцоо",
  related: "Хамт өргөн мэдүүлсэн төсөл",
  discussion: "Хэлэлцүүлгийн тайлан",
  letter: "Албан бичиг",
  other: "Бусад баримт",
};

/** Character budget per role (≈32k chars in total ≈ 12–16k tokens of Mongolian text). */
const ROLE_BUDGET: Record<DocRole, number> = {
  draft: 11_000,
  concept: 7_000,
  introduction: 6_000,
  needs: 5_000,
  impact: 3_000,
  cost: 2_000,
  related: 2_000,
  discussion: 1_500,
  letter: 1_000,
  other: 1_500,
};
export const TOTAL_BUDGET = 32_000;
/** Bump when selection rules change, so the cache key marks older briefs for regeneration. */
export const SELECTION_VERSION = 2;
const ROLE_ORDER: DocRole[] = ["draft", "concept", "introduction", "needs", "impact", "cost", "related", "discussion", "letter", "other"];
const MAX_DOCS = 8;
const SECTION_MAX = 1_600;

/** Filename first (staff often file a concept under "Бусад"), then the official category id. */
export function roleOf(doc: Pick<ProjectDocument, "filename" | "categoryId" | "category" | "step">): DocRole {
  const f = doc.filename.normalize("NFC").toLocaleLowerCase("mn").replace(/[_-]+/g, " ");
  if (/үзэл\s*баримтлал/.test(f)) return "concept";
  if (/дагах\s*хуул|дагалдах|хамт\s*өргөн/.test(f)) return "related";
  if (/танилцуулга|taniltsuulga/.test(f)) return "introduction";
  if (/хэрэгцээ|тандан|шаардлагын\s*үнэлгээ/.test(f)) return "needs";
  if (/үр\s*нөлөө|үр\s*дагав|хэрэгжилт/.test(f)) return "impact";
  if (/зардал|cost/.test(f)) return "cost";
  if (/хэлэлцүүлгийн\s*үр\s*дүн|санал\s*авсан|нийтийн\s*сонсгол/.test(f)) return "discussion";
  if (/албан\s*бичиг/.test(f)) return "letter";
  if (doc.step && doc.step !== "Өргөн мэдүүлэх") return "other";
  switch (doc.categoryId) {
    case "76": // Төслийн документ файл /DOC, DOCX/
    case "22": // Өргөн мэдүүлсэн төслийн цахим эх хувь
      return "draft";
    case "1":
      return "concept";
    case "2":
      return "introduction";
    case "5":
      return "needs";
    case "23":
      return "impact";
    case "3":
      return "cost";
    case "17": // Хамт өргөн мэдүүлсэн хууль тогтоомжийн төсөл
      return "related";
    case "20":
      return "letter";
    default:
      return "other";
  }
}

/** Chip label: the role, sharpened by the filename where it says more ("Дэлгэрэнгүй танилцуулга"). */
export function labelFor(role: DocRole, filename: string, projectType?: string | null): string {
  const f = filename.normalize("NFC").toLocaleLowerCase("mn");
  if (role === "introduction" && /дэлгэрэнгүй/.test(f)) return "Дэлгэрэнгүй танилцуулга";
  if (role === "introduction" && /товч/.test(f)) return "Товч танилцуулга";
  if (role === "draft") return /тогтоол/i.test(projectType ?? "") || /тогтоол/.test(f) ? "Тогтоолын төсөл" : "Хуулийн төсөл";
  return ROLE_LABEL[role];
}

export interface Section {
  heading: string | null;
  page: number | null;
  text: string;
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    // cut at the last sentence end (or line break) before `max`
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"), window.lastIndexOf("\n"), window.lastIndexOf("; "));
    const at = cut > max * 0.5 ? cut + 1 : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Blocks → sections that start at headings and stay under SECTION_MAX characters. */
export function toSections(blocks: ExtractedBlock[], max = SECTION_MAX): Section[] {
  const sections: Section[] = [];
  let heading: string | null = null;
  let page: number | null = null;
  let text = "";
  const flush = () => {
    const t = text.trim();
    if (t) sections.push({ heading, page, text: t });
    text = "";
  };
  for (const b of blocks) {
    if (b.kind === "heading") {
      // A heading opens a new section — unless the current one is still only headings (chapter + title).
      if (text.length > 200) flush();
      if (!text) {
        heading = b.text.slice(0, 160);
        page = b.page ?? null;
      } else {
        heading = heading ? `${heading} — ${b.text.slice(0, 120)}` : b.text.slice(0, 160);
      }
      text += `${b.text}\n`;
      continue;
    }
    for (const piece of splitLong(b.text, max)) {
      if (text && text.length + piece.length > max) flush(); // continuation keeps the same heading
      if (!text) page = b.page ?? page;
      text += `${piece}\n`;
    }
  }
  flush();
  return sections;
}

const DRAFT_SIGNAL =
  /зорил|үйлчлэх хүрээ|нэр томьёо|үүрэг|эрх\b|эрхтэй|хориглоно|хариуцлага|торгу|зөрчил|хугацаа|дагаж мөрдөж|хүчин төгөлдөр|хүчингүй|нэмсүгэй|өөрчилсүгэй|тайлагна|нийтэд|ил тод|зөвшөөрөл|байгуулна|татвар|төлбөр|хураамж|санхүүжилт|хэрэглэгч|иргэн/iu;
const CONCEPT_SIGNAL = /үндэслэл|шаардлага|зорилго|бүтэц|зохицуулах|харилцаа|үр дагавар|нөлөө|уялдаа|асуудал/iu;
const FINDINGS_SIGNAL = /дүгнэлт|зөвлөмж|санал|асуудал|шаардлага|зорилго|үр дүн|хэрэгцээ|нийт\s+зардал|шийдэл/iu;

function scoreSection(role: DocRole, s: Section, index: number, count: number): number {
  const head = s.heading ?? "";
  const early = index < 3 ? 3 - index : 0;
  switch (role) {
    case "draft":
      return early * 2 + (DRAFT_SIGNAL.test(s.text) ? 2 : 0) + (index === count - 1 ? 2 : 0); // last section: entry into force
    case "concept":
    case "introduction":
      return early + (CONCEPT_SIGNAL.test(head) ? 4 : CONCEPT_SIGNAL.test(s.text) ? 1 : 0);
    case "needs":
    case "impact":
    case "cost":
    case "discussion":
      return (FINDINGS_SIGNAL.test(head) ? 4 : 0) + (FINDINGS_SIGNAL.test(s.text) ? 1 : 0) + (index < 2 ? 1 : 0);
    default:
      return early;
  }
}

/** Article/chapter headings of a draft as one compact outline section (tells the model the structure). */
function outlineOf(blocks: ExtractedBlock[]): string | null {
  const heads = blocks.filter((b) => b.kind === "heading").map((b) => b.text.replace(/\s+/g, " ").slice(0, 110));
  if (heads.length < 4) return null;
  let out = "";
  for (const h of heads) {
    if (out.length + h.length > 1_800) break;
    out += `${h}\n`;
  }
  return `Бүтэц (гарчгууд):\n${out.trim()}`;
}

export interface SourceInput {
  doc: ProjectDocument;
  role: DocRole;
  blocks: ExtractedBlock[];
}

export interface SelectedDoc {
  ref: string;
  input: SourceInput;
  excerpts: BriefExcerpt[];
}

/**
 * Pick documents and sections within the budget. Documents are numbered in the order the model reads them
 * (D1 = most important); a role's unused budget is passed on to the next role.
 */
export function selectExcerpts(inputs: SourceInput[], total = TOTAL_BUDGET): SelectedDoc[] {
  const ranked = [...inputs]
    .filter((i) => i.blocks.length)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.blocks.length - a.blocks.length)
    .slice(0, MAX_DOCS);
  const perRoleCount = new Map<DocRole, number>();
  for (const r of ranked) perRoleCount.set(r.role, (perRoleCount.get(r.role) ?? 0) + 1);
  // When key documents are unreadable (scans), the roles that remain share their budget (up to 3×).
  const presentBudget = [...perRoleCount.keys()].reduce((s, r) => s + ROLE_BUDGET[r], 0);
  const scale = Math.min(3, Math.max(1, total / Math.max(1, presentBudget)));

  const out: SelectedDoc[] = [];
  let used = 0;
  let carry = 0;
  ranked.forEach((input, di) => {
    const ref = `D${di + 1}`;
    const share = Math.floor((ROLE_BUDGET[input.role] * scale) / (perRoleCount.get(input.role) ?? 1));
    const budget = Math.min(share + carry, total - used);
    const sections = toSections(input.blocks);
    const outline = input.role === "draft" ? outlineOf(input.blocks) : null;
    const candidates = sections
      .map((s, i) => ({ s, i, score: scoreSection(input.role, s, i, sections.length) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    const picked: { s: Section; i: number }[] = [];
    let spent = 0;
    if (outline && outline.length < budget / 3) {
      picked.push({ s: { heading: "Бүтэц", page: null, text: outline }, i: -1 });
      spent += outline.length;
    }
    for (const c of candidates) {
      if (spent + c.s.text.length > budget) continue;
      picked.push(c);
      spent += c.s.text.length;
    }
    picked.sort((a, b) => a.i - b.i); // read in document order
    const excerpts = picked.map((p, n) => ({ id: `${ref}.${n + 1}`, docRef: ref, heading: p.s.heading, page: p.s.page, text: p.s.text }));
    used += spent;
    carry = Math.max(0, budget - spent);
    if (excerpts.length) out.push({ ref, input, excerpts });
  });
  // renumber so refs stay dense (D1, D2, …) even when a document contributed nothing
  return out.map((d, i) => {
    const ref = `D${i + 1}`;
    return { ...d, ref, excerpts: d.excerpts.map((e, n) => ({ ...e, id: `${ref}.${n + 1}`, docRef: ref })) };
  });
}
