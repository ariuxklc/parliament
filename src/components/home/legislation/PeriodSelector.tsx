"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import styles from "./legislation.module.css";
import type { ParliamentSession, YearBucket } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { sessionShortLabel } from "@/lib/normalize/sessions";

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
 * Two quiet rows: the years (newest first, like a table of contents) and, under them, the official
 * sessions of the chosen year. Arrow keys move between years.
 */
export function PeriodSelector({ years, year, sessions, sessionCounts, session, yearTotal, onYear, onSession }: PeriodSelectorProps) {
  const list = [...years].filter((y) => y.count > 0 || y.year === year).sort((a, b) => b.year - a.year);
  const idx = list.findIndex((y) => y.year === year);
  const railRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const el = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !el) return;
    if (el.offsetLeft < rail.scrollLeft || el.offsetLeft + el.offsetWidth > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: el.offsetLeft - 24, behavior: "smooth" });
    }
  }, [year]);

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = list[idx + delta];
    if (next) {
      onYear(next.year);
      requestAnimationFrame(() => railRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus());
    }
  };

  return (
    <div className={styles.period}>
      <div className={styles.years} ref={railRef} role="group" aria-label={t.laws.yearLabel} onKeyDown={onKeyDown}>
        {list.map((y) => {
          const active = y.year === year;
          return (
            <button
              key={y.year}
              type="button"
              className={styles.year}
              aria-pressed={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onYear(y.year)}
              title={t.laws.count(y.count)}
            >
              {y.year}
            </button>
          );
        })}
      </div>

      {sessions.length ? (
        <div className={styles.sessions} role="group" aria-label={t.laws.periodLabel}>
          <button type="button" className={styles.session} aria-pressed={session === null} onClick={() => onSession(null)}>
            {t.laws.wholeYear}
            {yearTotal !== null ? <span className="tabular">{formatNumber(yearTotal)}</span> : null}
          </button>
          {sessions.map((s) => (
            <button key={s.key} type="button" className={styles.session} aria-pressed={session === s.key} onClick={() => onSession(s.key)}>
              {s.isOpen ? <span className={styles.openDot} aria-hidden="true" /> : null}
              {sessionShortLabel(s)}
              {s.isOpen ? <span className="visually-hidden"> (одоо үргэлжилж буй)</span> : null}
              <span className="tabular">{formatNumber(sessionCounts[s.key] ?? 0)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
