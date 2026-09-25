import styles from "./documents.module.css";
import { ChevronDown, Download } from "@/components/ui/icons";
import { STEP_ORDER, type ProjectDocument } from "@/lib/projects/types";
import { roleOf } from "@/lib/project-summaries/sources";
import type { DocRole, ProjectBrief } from "@/lib/project-summaries/types";

/**
 * "Албан ёсны материал": the few files most people want (the draft, Үзэл баримтлал, Танилцуулга) as quiet
 * rows, and every other official file one click away under "Бүх файл". Later procedure steps are grouped by
 * the step their official category names — prepared for that step, not proof that it was held.
 */

const TYPE_LABEL: Record<ProjectDocument["fileType"], string> = { pdf: "PDF", docx: "DOCX", doc: "DOC", xlsx: "XLSX", image: "Зураг", other: "Файл" };
const PRIORITY: DocRole[] = ["draft", "concept", "introduction", "needs", "impact", "cost", "related", "discussion", "letter", "other"];
const KEY_COUNT = 4;

function stepRank(step: string): number {
  const i = STEP_ORDER.indexOf(step);
  return i < 0 ? STEP_ORDER.length : i;
}

function Rows({ docs, used, skipped }: { docs: ProjectDocument[]; used: Map<number, string>; skipped: Map<number, string> }) {
  return (
    <ul className={styles.rows}>
      {docs.map((d) => {
        const n = used.get(d.fileId);
        const scan = skipped.get(d.fileId) === "needs-ocr";
        // Lead with what the file is: "Бусад" says nothing, and a published title like "Товч танилцуулга"
        // is more specific than its category.
        const cat = d.category.toLocaleLowerCase("mn");
        const title = d.title?.trim() || null;
        const named = title ?? d.filename.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_+/g, " ").trim();
        const generic = cat === "бусад";
        const specific = !!title && title.toLocaleLowerCase("mn") !== cat && title.toLocaleLowerCase("mn").includes(cat);
        // "Төслийн документ файл /DOC, DOCX/" (category 76) is the draft itself.
        const primary = generic ? named : specific ? title! : d.categoryId === "76" ? "Төслийн эх бичвэр" : d.category;
        const secondary = generic ? d.category : d.filename;
        return (
          <li key={d.fileId} className={styles.row}>
            <span className={styles.type} data-type={d.fileType}>
              {TYPE_LABEL[d.fileType]}
            </span>
            <span className={styles.name}>
              <a href={d.fileType === "pdf" ? d.viewUrl : d.officialUrl} target="_blank" rel="noopener noreferrer" title={d.categoryTitle}>
                {primary}
                <span className="visually-hidden"> — албан ёсны файл (шинэ цонхонд)</span>
              </a>
              <span className={styles.filename}>{secondary}</span>
            </span>
            {n ? (
              <span className={styles.tag} data-kind="used" title={`AI тайлбарын эх сурвалж ${n}`}>
                AI {n}
              </span>
            ) : scan ? (
              <span className={styles.tag} data-kind="scan" title="Сканнердсан файл — текстийг AI уншаагүй">
                скан
              </span>
            ) : null}
            <a className={styles.download} href={d.officialUrl} target="_blank" rel="noopener noreferrer" title="Татах">
              <Download size={15} />
              <span className="visually-hidden">Татах: {d.filename}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function OfficialDocuments({ documents, brief }: { documents: ProjectDocument[]; brief: ProjectBrief | null }) {
  const used = new Map((brief?.sources ?? []).map((s) => [s.fileId, s.ref.replace(/^D/, "")]));
  const skipped = new Map((brief?.skipped ?? []).map((s) => [s.fileId, s.reason]));

  // Most useful first: by kind of document, and within a kind the files the AI brief could actually read
  // (a scanned duplicate of the draft goes under "Бүх файл").
  const submission = documents
    .filter((d) => d.step === "Өргөн мэдүүлэх" || !d.step)
    .sort((a, b) => PRIORITY.indexOf(roleOf(a)) - PRIORITY.indexOf(roleOf(b)) || Number(!used.has(a.fileId)) - Number(!used.has(b.fileId)));
  const key = submission.slice(0, KEY_COUNT);
  const rest = submission.slice(KEY_COUNT);
  const laterSteps = new Map<string, ProjectDocument[]>();
  for (const d of documents) if (d.step && d.step !== "Өргөн мэдүүлэх") laterSteps.set(d.step, [...(laterSteps.get(d.step) ?? []), d]);
  const later = [...laterSteps].sort((a, b) => stepRank(a[0]) - stepRank(b[0]));
  // Projects without a submission package (e.g. reports) still show their first files up front.
  const upFront = key.length ? key : later[0]?.[1].slice(0, KEY_COUNT) ?? [];
  const hidden = documents.length - upFront.length;

  return (
    <section className={styles.section} aria-labelledby="official-docs-title">
      <div className={styles.head}>
        <h2 id="official-docs-title">Албан ёсны материал</h2>
        <p>{documents.length} файл</p>
      </div>

      <Rows docs={upFront} used={used} skipped={skipped} />

      {hidden > 0 ? (
        <details className={styles.more}>
          <summary>
            <span className={styles.foldTitle}>
              Бүх файл<span className={styles.count}>&nbsp;·&nbsp;{hidden}</span>
            </span>
            <span className={styles.toggle}>
              <span className={styles.whenClosed}>Дэлгэрэнгүй</span>
              <span className={styles.whenOpen}>Хураах</span>
              <ChevronDown size={15} />
            </span>
          </summary>
          <div className={styles.moreBody}>
            {key.length && rest.length ? <Rows docs={rest} used={used} skipped={skipped} /> : null}
            {later.map(([step, docs]) => {
              const shown = key.length ? docs : docs.filter((d) => !upFront.includes(d));
              return shown.length ? (
                <div key={step} className={styles.group}>
                  <h3 className={styles.stepTitle}>«{step}» шат</h3>
                  <Rows docs={shown} used={used} skipped={skipped} />
                </div>
              ) : null;
            })}
          </div>
        </details>
      ) : null}
    </section>
  );
}
