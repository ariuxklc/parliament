"use client";

import styles from "./legislation.module.css";
import type { ProposalStageFilter } from "@/lib/types";
import { LAW_STAGES } from "@/lib/lawStages";
import { t } from "@/lib/i18n";

interface LawJourneyProps {
  stage: ProposalStageFilter;
  onStage: (stage: ProposalStageFilter) => void;
  counts: { drafting: number; submitted: number };
}

/**
 * The official 10-step legislative process. Steps LawForum covers are interactive filters;
 * the rest are shown for orientation only (we have no per-bill data for them yet).
 */
export function LawJourney({ stage, onStage, counts }: LawJourneyProps) {
  return (
    <div className={styles.journey}>
      <div className={styles.journeyHead}>
        <h3>{t.laws.journeyTitle}</h3>
        <p>{t.laws.journeyNote}</p>
      </div>
      <ol className={styles.journeyList}>
        {LAW_STAGES.map((s, i) => {
          const interactive = Boolean(s.lawforumStage);
          const pressed = interactive && stage === s.lawforumStage;
          const count = s.lawforumStage ? counts[s.lawforumStage] : null;
          return (
            <li key={s.name} className={styles.journeyStep} data-interactive={interactive} data-active={pressed}>
              {interactive ? (
                <button type="button" aria-pressed={pressed} onClick={() => onStage(pressed ? "all" : s.lawforumStage!)}>
                  <span className={styles.journeyNum}>{i + 1}</span>
                  <span className={styles.journeyName}>{s.name}</span>
                  <span className={styles.journeyCount}>{t.laws.count(count ?? 0)}</span>
                </button>
              ) : (
                <div>
                  <span className={styles.journeyNum}>{i + 1}</span>
                  <span className={styles.journeyName}>{s.name}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className={styles.journeySource}>{t.laws.journeySource}</p>
    </div>
  );
}
