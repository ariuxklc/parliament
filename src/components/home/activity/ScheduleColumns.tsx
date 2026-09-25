"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./activity.module.css";
import type { ScheduleDay, ScheduleEvent } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatMonthDay, todayLocal } from "@/lib/format";
import { MapPin } from "../../ui/icons";

const KIND_ORDER: ScheduleEvent["kind"][] = ["PLENARY", "COMMITTEE", "WORKING_GROUP", "OTHER"];

function countsByKind(day: ScheduleDay) {
  const m = new Map<ScheduleEvent["kind"], number>();
  for (const e of day.events) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
  return KIND_ORDER.filter((k) => m.has(k)).map((k) => ({ kind: k, count: m.get(k)! }));
}

/**
 * Official weekly schedule as expanding day columns.
 * Hover / focus / tap highlights a day: it widens, its neighbours compress, and the full agenda appears.
 * Inner content has a fixed min-width so text never re-wraps while the column animates.
 * On narrow screens the columns become a stacked accordion.
 */
export function ScheduleColumns({ days }: { days: ScheduleDay[] }) {
  const defaultIndex = useMemo(() => {
    const today = todayLocal();
    const i = days.findIndex((d) => d.date === today);
    if (i >= 0) return i;
    const plenary = days.findIndex((d) => d.events.some((e) => e.kind === "PLENARY"));
    return plenary >= 0 ? plenary : 0;
  }, [days]);

  const [pinned, setPinned] = useState(defaultIndex);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? pinned;

  useEffect(() => setPinned(defaultIndex), [defaultIndex]);

  return (
    <div className={styles.columns} onPointerLeave={() => setHovered(null)} style={{ ["--cols" as string]: days.length }}>
      {days.map((day, i) => {
        const isActive = i === active;
        const counts = countsByKind(day);
        const panelId = `sched-${day.date}`;
        return (
          <article
            key={day.date}
            className={styles.column}
            data-active={isActive}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(i)}
          >
            <h3 className={styles.columnHead}>
              <button
                type="button"
                className={styles.columnButton}
                aria-expanded={isActive}
                aria-controls={panelId}
                onClick={() => {
                  setPinned(i);
                  setHovered(null);
                }}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
              >
                <span className={styles.weekday}>{day.weekday}</span>
                <span className={styles.dayNumber}>{Number(day.date.slice(8, 10))}</span>
                <span className={styles.month}>{formatMonthDay(day.date).replace(/\s\d+$/, "")}</span>
              </button>
            </h3>
            <ul className={styles.kindList} aria-label="Хуралдааны төрөл">
              {counts.map((c) => (
                <li key={c.kind} data-kind={c.kind}>
                  <span className={styles.kindDot} aria-hidden="true" />
                  {t.activity.kinds[c.kind]} <strong className="tabular">{c.count}</strong>
                </li>
              ))}
            </ul>
            {/* compact preview for collapsed days (decorative duplicate of the full list below) */}
            <ul className={styles.preview} aria-hidden="true">
              {day.events.slice(0, 3).map((e, j) => (
                <li key={j} data-kind={e.kind}>
                  {e.time ? <span className="tabular">{e.time}</span> : null}
                  {e.title}
                </li>
              ))}
              {day.events.length > 3 ? <li className={styles.previewMore}>+ {day.events.length - 3}</li> : null}
            </ul>
            <div id={panelId} className={styles.columnBody} aria-hidden={!isActive}>
              <ol className={styles.events}>
                {day.events.map((e, j) => (
                  <li key={j} className={styles.event} data-kind={e.kind}>
                    <div className={styles.eventMeta}>
                      {e.time ? <span className="tabular">{e.time}</span> : null}
                      {e.room ? (
                        <span className={styles.room}>
                          <MapPin size={12} />
                          {e.room}
                        </span>
                      ) : null}
                    </div>
                    <p className={styles.eventTitle}>{e.title}</p>
                    {e.agendaItems.length ? (
                      <ul className={styles.agenda}>
                        {e.agendaItems.slice(0, 4).map((a, k) => (
                          <li key={k}>{a}</li>
                        ))}
                        {e.agendaItems.length > 4 ? <li className={styles.agendaMore}>+ {e.agendaItems.length - 4}</li> : null}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </article>
        );
      })}
    </div>
  );
}
