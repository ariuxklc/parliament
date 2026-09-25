"use client";

import { useId, useMemo, useState } from "react";
import styles from "./activity.module.css";
import type { ScheduleDay, ScheduleEvent } from "@/lib/types";
import { t } from "@/lib/i18n";
import { todayLocal } from "@/lib/format";
import { ChevronDown } from "../../ui/icons";

const KIND_ORDER: ScheduleEvent["kind"][] = ["PLENARY", "COMMITTEE", "WORKING_GROUP", "OTHER"];

const byTime = (a: ScheduleEvent, b: ScheduleEvent) => (a.time ?? "99").localeCompare(b.time ?? "99");

/** One line per kind of meeting: plenary shows its start times, the rest a count. */
function summary(day: ScheduleDay) {
  return KIND_ORDER.map((kind) => {
    const events = day.events.filter((e) => e.kind === kind).sort(byTime);
    if (!events.length) return null;
    const times = events.map((e) => e.time).filter(Boolean) as string[];
    const detail = kind === "PLENARY" ? times.join(", ") : t.activity.eventsCount(events.length);
    return { kind, label: t.activity.kinds[kind], detail };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

/**
 * The week at a glance: each day shows only its date and what meets that day.
 * Choosing a day opens that day's meetings underneath (time + title); nothing else by default.
 */
export function ScheduleColumns({ days }: { days: ScheduleDay[] }) {
  const today = todayLocal();
  const [open, setOpen] = useState<string | null>(null);
  const id = useId();
  const openDay = useMemo(() => days.find((d) => d.date === open) ?? null, [days, open]);

  return (
    <div className={styles.week}>
      <ol className={styles.days} style={{ ["--days" as string]: days.length }}>
        {days.map((day) => {
          const lines = summary(day);
          const isOpen = open === day.date;
          return (
            <li key={day.date} className={styles.day} data-plenary={lines.some((l) => l.kind === "PLENARY")} data-today={day.date === today} data-open={isOpen}>
              <button type="button" className={styles.dayButton} aria-expanded={isOpen} aria-controls={`${id}-detail`} onClick={() => setOpen(isOpen ? null : day.date)}>
                <span className={styles.weekday}>
                  {day.weekday.charAt(0) + day.weekday.slice(1).toLowerCase()}
                  {day.date === today ? <span className={styles.todayTag}>Өнөөдөр</span> : null}
                </span>
                <span className={styles.dayNumber}>
                  {Number(day.date.slice(8, 10))}
                  <span className={styles.month}>{Number(day.date.slice(5, 7))}-р сар</span>
                </span>
                <span className={styles.lines}>
                  {lines.map((l) => (
                    <span key={l.kind} className={styles.line} data-kind={l.kind}>
                      <span className={styles.lineLabel}>{l.label}</span>
                      <span className={`tabular ${styles.lineDetail}`}>{l.detail}</span>
                    </span>
                  ))}
                </span>
                <ChevronDown size={16} className={styles.dayChevron} />
              </button>
            </li>
          );
        })}
      </ol>

      <div id={`${id}-detail`} className={styles.detail} hidden={!openDay} aria-live="polite">
        {openDay ? (
          <>
            <p className={styles.detailHead}>
              {openDay.weekday.charAt(0) + openDay.weekday.slice(1).toLowerCase()}, {Number(openDay.date.slice(5, 7))}-р сарын {Number(openDay.date.slice(8, 10))}
            </p>
            <ol className={styles.detailList}>
              {[...openDay.events].sort(byTime).map((e, i) => (
                <li key={i} data-kind={e.kind}>
                  <span className={`tabular ${styles.detailTime}`}>{e.time ?? "—"}</span>
                  <span className={styles.detailBody}>
                    <span className={styles.detailTitle}>{e.title}</span>
                    {e.kind === "PLENARY" && e.agendaItems[0] ? <span className={styles.detailAgenda}>{e.agendaItems[0]}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </div>
  );
}
