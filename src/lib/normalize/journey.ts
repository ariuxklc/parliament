import { LAW_STAGES } from "../lawStages";
import { cleanText, formatDate } from "../format";

/**
 * Bill Journey: places one bill on the official 10-stage process (src/lib/lawStages.ts).
 *
 * Only facts recorded by an official source are marked. Rules, derived from the bulletin data
 * (new.parliament.mn /api/bills-public/, verified 2026-09-25 across all 98 rows):
 *  - A label ending in "…явуулсан" ("was held") always carries committee + plenary dates and is
 *    followed by later entries → that stage is COMPLETED.
 *  - The LAST entry without "явуулсан" (e.g. "Эцэслэн батлах" with no dates) is the stage the bill
 *    is waiting at → CURRENT. It is never shown as completed.
 *  - Labels that do not name one of the 10 official stages ("Хэлэлцэх", "Хоёр дахь хэлэлцүүлэг",
 *    "Зөвшилцөх", …) are shown verbatim as "other records", not placed on the track.
 *  - Stages before the furthest recorded one, with no record of their own, are PASSED (sequence
 *    implies it) but carry no date. Nothing after the furthest recorded stage is inferred.
 * Without a bulletin match only the LawForum listing is known (stage 1 or 2).
 */

export type JourneyState = "done" | "passed" | "current" | "upcoming";

export interface JourneyRecord {
  label: string;
  committee: string | null; // Байнгын хорооны хуралдааны тэмдэглэл (date + notes, verbatim)
  plenary: string | null; // Нэгдсэн хуралдааны тэмдэглэл
}

export interface JourneyStep {
  index: number; // 0-based position in LAW_STAGES
  name: string;
  state: JourneyState;
  note: string | null;
  records: JourneyRecord[];
}

export interface BillJourneyModel {
  steps: JourneyStep[];
  furthest: number;
  summary: string;
  asOf: string | null; // bulletin snapshot date (YYYY-MM-DD) when used
  otherRecords: JourneyRecord[];
  source: "lawforum" | "bulletin";
}

interface BillLike {
  stage: "drafting" | "submitted";
  publishedDate: string;
}

interface BulletinLike {
  submittedDate: string | null;
  snapshotDate: string;
  stages: { label: string; committeeNote: string; plenaryNote: string }[];
}

/** Bulletin label → LAW_STAGES index. Order matters: specific phrases first. */
const STAGE_PATTERNS: [RegExp, number][] = [
  [/хэлэлцэх эсэх/i, 3],
  [/анхны хэлэлцүүлэг|нэг дэх хэлэлцүүлэг/i, 4],
  [/эцсийн хэлэлцүүлэг/i, 5],
  [/эцэслэн батлах/i, 6],
];
const COMPLETED = /явуулсан/i;

function stageIndexOf(label: string): number | null {
  return STAGE_PATTERNS.find(([re]) => re.test(label))?.[1] ?? null;
}

function toRecord(s: BulletinLike["stages"][number]): JourneyRecord {
  return {
    label: cleanText(s.label).replace(/\.$/, ""),
    committee: cleanText(s.committeeNote) || null,
    plenary: cleanText(s.plenaryNote) || null,
  };
}

export function buildJourney(bill: BillLike, row: BulletinLike | null | undefined): BillJourneyModel {
  const steps: JourneyStep[] = LAW_STAGES.map((s, index) => ({ index, name: s.name, state: "upcoming", note: null, records: [] }));

  if (!row) {
    if (bill.stage === "drafting") {
      steps[0].state = "current";
      steps[0].note = `LawForum-д санал авахаар нийтэлсэн: ${formatDate(bill.publishedDate)}`;
      return {
        steps,
        furthest: 0,
        summary: "Төсөл боловсруулах шатанд байна — LawForum-д олон нийтээс санал авч байна.",
        asOf: null,
        otherRecords: [],
        source: "lawforum",
      };
    }
    steps[0].state = "passed";
    steps[1].state = "done";
    steps[1].note = "LawForum-ын «Өргөн мэдүүлсэн төслүүд» хэсэгт бүртгэлтэй";
    return {
      steps,
      furthest: 1,
      summary: "Өргөн мэдүүлсэн гэж LawForum-д бүртгэлтэй. Цаашдын шатыг УИХ-ын бюллетенээс баталгаажуулах боломжгүй байна.",
      asOf: null,
      otherRecords: [],
      source: "lawforum",
    };
  }

  steps[0].state = "passed";
  steps[1].state = "done";
  steps[1].note = row.submittedDate ? `Өргөн мэдүүлсэн: ${formatDate(row.submittedDate)}` : "Өргөн мэдүүлсэн (огноо бюллетенд алга)";

  let furthest = 1;
  const otherRecords: JourneyRecord[] = [];
  let currentLabel: string | null = null;

  for (const [i, s] of row.stages.entries()) {
    const rec = toRecord(s);
    const idx = stageIndexOf(s.label);
    const isLast = i === row.stages.length - 1;
    const completed = COMPLETED.test(s.label);
    if (idx === null) {
      otherRecords.push(rec);
      if (isLast && !completed) currentLabel = rec.label;
      continue;
    }
    steps[idx].records.push(rec);
    // Not "held" and last → waiting at this stage; not "held" but followed by later entries → moved on.
    const state: JourneyState = completed || !isLast ? "done" : "current";
    if (steps[idx].state !== "done") steps[idx].state = state;
    if (idx > furthest) furthest = idx;
  }

  for (let i = 0; i < furthest; i++) if (steps[i].state === "upcoming") steps[i].state = "passed";

  const asOf = formatDate(row.snapshotDate);
  const current = steps.find((s) => s.state === "current");
  let summary: string;
  if (current) summary = `${asOf}-ний байдлаар «${current.name}» шатанд байна.`;
  else if (currentLabel) summary = `${asOf}-ний байдлаар бюллетенд «${currentLabel}» гэж тэмдэглэгдсэн (албан ёсны 10 шатны аль нь болохыг эх сурвалж заагаагүй).`;
  else summary = `${asOf}-ний байдлаар хамгийн сүүлд «${steps[furthest].name}» шатыг явуулсан гэж тэмдэглэгдсэн.`;

  return { steps, furthest, summary, asOf: row.snapshotDate, otherRecords, source: "bulletin" };
}
