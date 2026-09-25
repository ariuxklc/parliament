import type { ReactNode } from "react";
import styles from "./brief.module.css";
import { ChevronDown } from "@/components/ui/icons";
import { formatDate } from "@/lib/format";
import { SECTION_TITLES, type BriefSourceDoc, type BriefStatement, type ProjectBrief } from "@/lib/project-summaries/types";

/**
 * The AI brief of a submitted project, directly under the 10-stage Bill Journey (on /projects/{id} and,
 * via the homepage session's BillStory, on /laws/{id}). Server-safe: no hooks, no client JS.
 *
 * Minimal by default: only the short summary is open. Each other part — changes, why, who is affected,
 * details, sources — is one labelled row that opens in place (native <details>), so nothing is removed but
 * nothing crowds the page. Every statement keeps small numbered markers that open the official file it
 * came from (PDFs at the cited page).
 */

interface Props {
  brief: ProjectBrief;
  headingLevel?: 2 | 3;
  /** Box heading; both bill pages pass "30 секундын AI тайлбар". The AI badge is always shown. */
  title?: string;
  /** True when the project's official files changed after the brief was written. */
  outdated?: boolean;
}

function docNumber(ref: string): number {
  return Number(ref.replace(/^D/, "")) || 0;
}

function hrefFor(doc: BriefSourceDoc, page: number | null): string {
  if (doc.fileType === "pdf") return page ? `${doc.viewUrl}#page=${page}` : doc.viewUrl;
  return doc.officialUrl;
}

function Markers({ refs, brief }: { refs: string[]; brief: ProjectBrief }) {
  const excerpt = new Map(brief.excerpts.map((e) => [e.id, e]));
  const docs = new Map(brief.sources.map((s) => [s.ref, s]));
  const seen = new Set<string>();
  const marks = refs
    .map((r) => excerpt.get(r))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .filter((e) => (seen.has(e.docRef) ? false : (seen.add(e.docRef), true)))
    .map((e) => ({ e, doc: docs.get(e.docRef) }))
    .filter((x): x is { e: (typeof x)["e"]; doc: BriefSourceDoc } => Boolean(x.doc));
  if (!marks.length) return null;
  return (
    <span className={styles.marks}>
      {marks.map(({ e, doc }) => (
        <a
          key={e.docRef}
          href={hrefFor(doc, e.page)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.mark}
          title={`${doc.label} — ${doc.filename}${e.page ? `, ${e.page}-р хуудас` : ""}`}
        >
          {docNumber(doc.ref)}
          <span className="visually-hidden">
            {" "}
            эх сурвалж: {doc.label} (албан ёсны файл, шинэ цонхонд)
          </span>
        </a>
      ))}
    </span>
  );
}

/** Statement text whose last word stays on the same line as its source markers. */
function Said({ item, brief }: { item: BriefStatement; brief: ProjectBrief }) {
  const i = item.text.lastIndexOf(" ");
  return (
    <>
      {i > 0 ? item.text.slice(0, i + 1) : ""}
      <span className={styles.nowrap}>
        {i > 0 ? item.text.slice(i + 1) : item.text}
        <Markers refs={item.refs} brief={brief} />
      </span>
    </>
  );
}

function Bullets({ items, brief }: { items: BriefStatement[]; brief: ProjectBrief }) {
  return (
    <ul className={styles.list}>
      {items.map((s, i) => (
        <li key={i}>
          <Said item={s} brief={brief} />
        </li>
      ))}
    </ul>
  );
}

/** One labelled row that opens in place. */
function Row({ label, count, children }: { label: string; count?: string; children: ReactNode }) {
  return (
    <details className={styles.row}>
      <summary>
        <span className={styles.rowLabel}>{label}</span>
        {count ? <span className={styles.rowCount}>{count}</span> : null}
        <ChevronDown size={16} />
      </summary>
      <div className={styles.rowBody}>{children}</div>
    </details>
  );
}

export function ProjectBriefView({ brief, headingLevel = 2, title = "AI тайлбар", outdated = false }: Props) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const S = `h${headingLevel + 1}` as "h3" | "h4";
  const id = `brief-${brief.projectId.slice(0, 8)}`;
  const docs = new Map(brief.sources.map((s) => [s.ref, s]));
  const scans = brief.skipped.filter((s) => s.reason === "needs-ocr");

  return (
    <section className={styles.brief} aria-labelledby={`${id}-title`}>
      <header className={styles.head}>
        <H id={`${id}-title`} className={styles.title}>
          {title}
        </H>
        <span className={styles.badge}>AI · хүн хянаагүй</span>
      </header>
      {outdated ? (
        <p className={styles.outdated} role="note">
          Тайлбарыг бэлтгэсний дараа албан ёсны файл шинэчлэгдсэн — эх файлыг шалгана уу.
        </p>
      ) : null}

      <div className={styles.lead}>
        <S className="visually-hidden">{SECTION_TITLES.summary}</S>
        <p>
          {brief.summary.map((s, i) => (
            <span key={i}>
              <Said item={s} brief={brief} />{" "}
            </span>
          ))}
        </p>
      </div>

      <div className={styles.rows}>
        {brief.mainChanges.length ? (
          <Row label={SECTION_TITLES.mainChanges} count={String(brief.mainChanges.length)}>
            <Bullets items={brief.mainChanges} brief={brief} />
          </Row>
        ) : null}

        <Row label={SECTION_TITLES.statedRationale}>
          {brief.statedRationale.length === 1 ? (
            <p className={styles.para}>
              <Said item={brief.statedRationale[0]} brief={brief} />
            </p>
          ) : brief.statedRationale.length ? (
            <Bullets items={brief.statedRationale} brief={brief} />
          ) : (
            <p className={styles.muted}>Уншсан баримт бичигт шалтгааныг тодорхой бичээгүй байна.</p>
          )}
        </Row>

        {brief.affectedAreas.length ? (
          <Row label={SECTION_TITLES.affectedAreas} count={String(brief.affectedAreas.length)}>
            <ul className={styles.affected}>
              {brief.affectedAreas.map((a, i) => (
                <li key={i}>
                  <span className={styles.who}>{a.who}</span>
                  <span>
                    <Said item={a} brief={brief} />
                  </span>
                </li>
              ))}
            </ul>
          </Row>
        ) : null}

        {brief.keyPoints.length ? (
          <Row label={SECTION_TITLES.keyPoints} count={String(brief.keyPoints.length)}>
            <Bullets items={brief.keyPoints} brief={brief} />
          </Row>
        ) : null}

        <Row label="Эх сурвалж" count={`${brief.sources.length} баримт`}>
          <ol className={styles.sourceList}>
            {brief.sources.map((s) => (
              <li key={s.ref}>
                <b>{docNumber(s.ref)}</b>
                <a href={hrefFor(s, null)} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
                <span className={styles.filename}>{s.filename}</span>
              </li>
            ))}
          </ol>
          {scans.length ? (
            <p className={styles.muted}>
              Сканнердсан {scans.length} файлыг уншаагүй: {scans.map((s) => s.filename).join(", ")}.
            </p>
          ) : null}
          {brief.excerpts.length ? (
            <details className={styles.excerpts}>
              <summary>Тайлбарт ашигласан хэсгүүдийг харах ({brief.excerpts.length})</summary>
              <ol>
                {brief.excerpts.map((e) => {
                  const doc = docs.get(e.docRef);
                  return (
                    <li key={e.id}>
                      <p className={styles.excerptMeta}>
                        <b>{docNumber(e.docRef)}</b> {doc?.label}
                        {e.page ? ` · ${e.page}-р хуудас` : ""}
                      </p>
                      <blockquote className={styles.excerptText}>{e.text.length > 700 ? `${e.text.slice(0, 700)}…` : e.text}</blockquote>
                    </li>
                  );
                })}
              </ol>
            </details>
          ) : null}
          <p className={styles.muted}>AI-аар {formatDate(brief.generatedAt)}-нд бэлтгэсэн тул алдаа байж болно. Албан ёсны баримт бичиг л хүчинтэй.</p>
        </Row>
      </div>
    </section>
  );
}
