"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import styles from "./legislation.module.css";
import type { ParliamentSession, YearBucket } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { sessionShortLabel } from "@/lib/normalize/sessions";
import { ArrowLeft, ArrowRight } from "../../ui/icons";

interface PeriodSelectorProps {
  years: YearBucket[];
  year: number;
  sessions: ParliamentSession[];
  sessionCounts: Record<string, number>;
  session: string | null;
  yearTotal: number | null;
  onYear: (year: number) => void;
  onSession: (key: string | null) => void;
}

/**
 * Timeline of years (oldest → newest, like a ruler) with a volume bar per year, plus the
 * official sessions of the selected year. Arrow keys move through time.
 */
export function PeriodSelector({ years, year, sessions, sessionCounts, session, yearTotal, onYear, onSession }: PeriodSelectorProps) {
  const chrono = [...years].sort((a, b) => a.year - b.year);
  const max = Math.max(1, ...chrono.map((y) => y.count));
  const idx = chrono.findIndex((y) => y.year === year);
  const railRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const el = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !el) return;
    const target = el.offsetLeft - rail.clientWidth / 2 + el.offsetWidth / 2;
    rail.scrollTo({ left: target, behavior: "smooth" });
  }, [year]);

  const step = (delta: number) => {
    const next = chrono[idx + delta];
    if (next) onYear(next.year);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  };

  return (
    <div className={styles.period}>
      <div className={styles.yearRow}>
        <button type="button" className={styles.stepButton} onClick={() => step(-1)} disabled={idx <= 0} aria-label="Өмнөх он">
          <ArrowLeft size={18} />
        </button>
        <div className={styles.yearRail} ref={railRef} role="group" aria-label={t.laws.yearLabel} onKeyDown={onKeyDown}>
          {chrono.map((y) => {
            const active = y.year === year;
            return (
              <button
                key={y.year}
                type="button"
                className={styles.yearButton}
                aria-pressed={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onYear(y.year)}
              >
                <span className={styles.yearBar} aria-hidden="true">
                  <span style={{ transform: `scaleY(${Math.max(0.06, y.count / max)})` }} />
                </span>
                <span className={styles.yearLabel}>{y.year}</span>
                <span className={styles.yearCount}>{t.laws.count(y.count)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.stepButton} onClick={() => step(1)} disabled={idx >= chrono.length - 1} aria-label="Дараагийн он">
          <ArrowRight size={18} />
        </button>
      </div>

      <div className={styles.sessionRow} role="group" aria-label={t.laws.periodLabel}>
        <button type="button" className={styles.sessionButton} aria-pressed={session === null} onClick={() => onSession(null)}>
          <span className={styles.sessionName}>{t.laws.wholeYear}</span>
          <span className={styles.sessionMeta}>
            {year} · {yearTotal !== null ? t.laws.count(yearTotal) : ""}
          </span>
        </button>
        {sessions.map((s) => (
          <button key={s.key} type="button" className={styles.sessionButton} aria-pressed={session === s.key} data-kind={s.kind} onClick={() => onSession(s.key)}>
            <span className={styles.sessionName}>
              {sessionShortLabel(s)}
              {s.isOpen ? <span className={styles.openBadge}>одоо</span> : null}
            </span>
            <span className={styles.sessionMeta}>
              {formatDate(s.startDate).slice(5)}–{s.isOpen ? "" : formatDate(s.endDate).slice(5)} · {t.laws.count(sessionCounts[s.key] ?? 0)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
