import styles from "./billJourney.module.css";
import { buildJourney, type BillJourneyModel, type JourneyState } from "@/lib/normalize/journey";
import { formatDate } from "@/lib/format";
import { ChevronDown } from "../ui/icons";

interface BillJourneyProps {
  bill: { stage: "drafting" | "submitted"; publishedDate: string };
  row?: { submittedDate: string | null; snapshotDate: string; stages: { label: string; committeeNote: string; plenaryNote: string }[] } | null;
  /**
   * Pre-built journey (e.g. the submitted-projects feature builds one from each project's official
   * stage documents). Must follow the same rules: mark a stage only when a source records it.
   */
  model?: BillJourneyModel;
  /** Replaces the default source line under the track. */
  sourceNote?: string;
}

const STATE_TEXT: Record<JourneyState, string> = {
  done: "Явуулсан",
  current: "Одоогийн шат",
  passed: "Тусдаа тэмдэглэл алга",
  upcoming: "",
};

/**
 * Visual Bill Journey for one bill on the official 10-stage process.
 * Marks only what LawForum or the Parliament bill bulletin records — see src/lib/normalize/journey.ts.
 * By default: the track and one line of status. The official records and the source note open in place
 * ("Дэлгэрэнгүй", native <details> — the same pattern as the AI brief under it).
 */
export function BillJourney({ bill, row, model, sourceNote }: BillJourneyProps) {
  const j = model ?? buildJourney(bill, row);
  const recorded = j.steps.filter((s) => s.note || s.records.length);

  return (
    <section className={styles.journey} aria-labelledby="bill-journey-title">
      <div className={styles.head}>
        <h2 id="bill-journey-title">Хууль батлах үе шат</h2>
        <p className={styles.summary}>{j.summary}</p>
      </div>

      <ol className={styles.track}>
        {j.steps.map((s) => (
          <li
            key={s.index}
            className={styles.step}
            data-state={s.state}
            data-link={s.index < j.furthest ? "filled" : "empty"}
            aria-current={s.state === "current" ? "step" : undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              {s.state === "done" ? (
                <svg viewBox="0 0 16 16" width="12" height="12">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                s.index + 1
              )}
            </span>
            <span className={styles.name}>{s.name}</span>
            {STATE_TEXT[s.state] ? <span className={styles.state}>{STATE_TEXT[s.state]}</span> : <span className="visually-hidden">Тэмдэглэл алга</span>}
          </li>
        ))}
      </ol>

      <details className={styles.more}>
        <summary>
          <span className={`${styles.moreLabel} ${styles.whenClosed}`}>Дэлгэрэнгүй</span>
          <span className={`${styles.moreLabel} ${styles.whenOpen}`}>Хураах</span>
          <span className={styles.moreHint}>
            {recorded.length ? `${recorded.length + j.otherRecords.length} албан ёсны тэмдэглэл · эх сурвалж` : "эх сурвалж"}
          </span>
          <ChevronDown size={16} />
        </summary>
        {recorded.length ? (
          <ul className={styles.records} aria-label="Албан ёсны тэмдэглэл">
            {recorded.map((s) => (
              <li key={s.index} data-state={s.state}>
                <span className={styles.recordStep}>
                  {s.index + 1}. {s.name}
                </span>
                <span className={styles.recordBody}>
                  {s.note ? <span>{s.note}</span> : null}
                  {s.records.map((r, i) => (
                    <span key={i}>
                      {/* the label often just repeats the stage name — show it only when it adds something ("…явуулсан") */}
                      {r.label.toLocaleLowerCase("mn") !== s.name.toLocaleLowerCase("mn") ? `«${r.label}»` : null}
                      {r.committee ? <small>Байнгын хороо: {r.committee}</small> : null}
                      {r.plenary ? <small>Нэгдсэн хуралдаан: {r.plenary}</small> : null}
                      {!r.committee && !r.plenary ? <small>Хуралдааны огноо бюллетенд тэмдэглэгдээгүй</small> : null}
                    </span>
                  ))}
                </span>
              </li>
            ))}
            {j.otherRecords.map((r, i) => (
              <li key={`o${i}`} data-state="other">
                <span className={styles.recordStep}>Бусад тэмдэглэл</span>
                <span className={styles.recordBody}>
                  <span>
                    «{r.label}»{r.committee ? <small>Байнгын хороо: {r.committee}</small> : null}
                    {r.plenary ? <small>Нэгдсэн хуралдаан: {r.plenary}</small> : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className={styles.source}>
          {sourceNote ?? (
            <>
              Зөвхөн албан ёсны эх сурвалжид тэмдэглэгдсэн шатыг тэмдэглэв
              {j.source === "bulletin" && j.asOf ? ` (LawForum; УИХ-ын хуулийн төслийн бюллетень, ${formatDate(j.asOf)}-ний байдлаар)` : " (LawForum)"}. Шатны
              дараалал: УИХ-ын Тамгын газар, Байнгын хорооны асуудал эрхлэх газар (2026).
            </>
          )}
        </p>
      </details>
    </section>
  );
}
