"use client";

import { useState } from "react";
import styles from "./legislation.module.css";
import type { ProposalsResponse } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";

interface AgendaPanelProps {
  agenda: ProposalsResponse["agenda"];
  periodLabel: string;
  meetingCount: number | null;
}

const PREVIEW = 6;

/**
 * What the plenary actually discussed in the selected period — from the Parliament API agenda,
 * whose codes carry the official session (see sessions.ts → agendaCodeToSessionKey).
 */
export function AgendaPanel({ agenda, periodLabel, meetingCount }: AgendaPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.agendaPanel}>
      <p className={styles.agendaEyebrow}>{periodLabel}</p>
      <h3 className={styles.agendaTitle}>{t.laws.agendaTitle}</h3>
      {meetingCount !== null ? (
        <p className={styles.agendaMeta}>
          <strong className="tabular">{formatNumber(meetingCount)}</strong> нэгдсэн хуралдаан
          {agenda ? (
            <>
              {" · "}
              <strong className="tabular">{formatNumber(agenda.total)}</strong> асуудал
            </>
          ) : null}
        </p>
      ) : agenda ? (
        <p className={styles.agendaMeta}>
          <strong className="tabular">{formatNumber(agenda.total)}</strong> асуудал
        </p>
      ) : null}

      {agenda ? (
        <>
          <ol className={styles.agendaList} data-expanded={expanded}>
            {(expanded ? agenda.items : agenda.items.slice(0, PREVIEW)).map((a) => (
              <li key={a.code}>{a.title}</li>
            ))}
          </ol>
          {agenda.items.length > PREVIEW ? (
            <button type="button" className={styles.agendaToggle} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Хураах" : t.laws.agendaMore(agenda.items.length - PREVIEW)}
            </button>
          ) : null}
        </>
      ) : (
        <p className={styles.agendaEmpty}>Энэ хугацааны нэгдсэн хуралдааны хэлэлцэх асуудлын мэдээлэл хуралдааны системд алга.</p>
      )}
      <p className={styles.agendaSource}>{t.laws.agendaSource}</p>
    </div>
  );
}
