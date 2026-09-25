import "server-only";
import { buildJourney, type BillJourneyModel } from "../normalize/journey";
import { LAW_STAGES } from "../lawStages";
import { parliamentSite } from "../sources/parliamentSite";
import { formatDate } from "../format";
import { coreTitleKey } from "./normalize.ts";
import type { SubmittedProject } from "./types.ts";

/**
 * The official 10-stage journey for a submitted project, built with the homepage's `buildJourney` rules:
 *  - stage 2 «Өргөн мэдүүлэх» is recorded because the project is in d.parliament.mn's official
 *    «Өргөн мэдүүлсэн төслүүд» list;
 *  - later stages come only from the Parliament bill bulletin (new.parliament.mn), matched when the
 *    title subject is equal (`coreTitleKey` drops the bulletin's "… хуулийн төсөл болон хамт өргөн
 *    мэдүүлсэн …" package notes) AND the bulletin's submission date is within 5 days of the project's date
 *    AND exactly one row matches (same-titled amendment bills recur, so title alone is never enough).
 *    Across all 351 projects (2026-09-25): 49 unique matches, 6 ambiguous ones correctly left unmatched;
 *  - attachment categories ("Анхны хэлэлцүүлэг -…") are NOT used here: a document may be prepared for a
 *    stage that has not been held. They are shown, grouped by stage, in the documents section instead.
 */

interface BulletinRowRaw {
  title: string;
  initiator_date: string | null;
  bulletin_snapshot_at: string;
  stages?: { stage_label: string; committee_meeting_note: string | null; plenary_meeting_note: string | null }[];
}

export interface ProjectJourney {
  model: BillJourneyModel;
  sourceNote: string;
  bulletinMatched: boolean;
}

const ORDER_NOTE = "Шатны дараалал: УИХ-ын Тамгын газар, Байнгын хорооны асуудал эрхлэх газар (2026).";

function days(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

export async function projectJourney(project: SubmittedProject): Promise<ProjectJourney> {
  const rows = ((await parliamentSite.billBulletin().catch(() => [])) as unknown as BulletinRowRaw[]) ?? [];
  const key = coreTitleKey(project.title);
  const matches = project.date && key
    ? rows.filter((r) => r.initiator_date && coreTitleKey(r.title ?? "") === key && days(r.initiator_date, project.date!) <= 5)
    : [];

  if (matches.length === 1) {
    const r = matches[0];
    const row = {
      submittedDate: r.initiator_date,
      snapshotDate: r.bulletin_snapshot_at,
      stages: (r.stages ?? []).map((s) => ({ label: s.stage_label ?? "", committeeNote: s.committee_meeting_note ?? "", plenaryNote: s.plenary_meeting_note ?? "" })),
    };
    const model = buildJourney({ stage: "submitted", publishedDate: project.date ?? "" }, row);
    return {
      model,
      bulletinMatched: true,
      sourceNote: `Зөвхөн албан ёсны эх сурвалжид тэмдэглэгдсэн шатыг тэмдэглэв (d.parliament.mn «Өргөн мэдүүлсэн төслүүд»; УИХ-ын хуулийн төслийн бюллетень, ${formatDate(r.bulletin_snapshot_at)}-ний байдлаар). ${ORDER_NOTE}`,
    };
  }

  const steps = LAW_STAGES.map((s, index) => ({ index, name: s.name, state: "upcoming" as const, note: null as string | null, records: [] }));
  const model: BillJourneyModel = {
    steps: steps.map((s) =>
      s.index === 0
        ? { ...s, state: "passed" as const }
        : s.index === 1
          ? { ...s, state: "done" as const, note: `«Өргөн мэдүүлсэн төслүүд» жагсаалтад бүртгэлтэй${project.date ? ` · ${formatDate(project.date)}` : ""}` }
          : s,
    ),
    furthest: 1,
    summary: "Улсын Их Хуралд өргөн мэдүүлсэн төслүүдийн албан ёсны жагсаалтад бүртгэлтэй. Дараагийн шатуудыг УИХ-ын бюллетенээс баталгаажуулах боломжгүй байна.",
    asOf: null,
    otherRecords: [],
    source: "lawforum",
  };
  return {
    model,
    bulletinMatched: false,
    sourceNote: `Зөвхөн албан ёсны эх сурвалжид тэмдэглэгдсэн шатыг тэмдэглэв (d.parliament.mn «Өргөн мэдүүлсэн төслүүд»). ${ORDER_NOTE}`,
  };
}
