"use client";

import Image from "next/image";
import { useRef } from "react";
import styles from "./members.module.css";
import type { MemberSummary } from "@/lib/types";
import { t } from "@/lib/i18n";

interface MemberCardProps {
  member: MemberSummary;
  selected: boolean;
  index: number;
  onPreview: (m: MemberSummary) => void; // hover / focus: warm the detail cache + show in the showcase
  onSelect: (m: MemberSummary) => void; // click / tap / Enter
}

/**
 * Compact roster card: portrait, name, party, role. Hover only lifts it a little (and quietly warms the
 * profile cache); pressing it opens the full card in a dialog.
 */
export function MemberCard({ member: m, selected, index, onPreview, onSelect }: MemberCardProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <li className={styles.cardItem} style={{ ["--i" as string]: index }}>
      <button
        ref={ref}
        type="button"
        className={styles.card}
        data-selected={selected}
        aria-haspopup="dialog"
        aria-expanded={selected}
        aria-label={t.members.select(`${m.lastName} ${m.firstName}`)}
        onPointerEnter={() => onPreview(m)}
        onFocus={() => onPreview(m)}
        onClick={() => onSelect(m)}
        style={{ ["--party" as string]: m.party?.color ?? "var(--ink-500)" }}
      >
        <span className={styles.portrait}>
          {m.portrait ? (
            <Image src={m.portrait} alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 1100px) 24vw, 180px" className={styles.portraitImg} />
          ) : (
            <span className={styles.portraitFallback} aria-hidden="true">
              {m.firstName.charAt(0)}
            </span>
          )}
          {m.roleShort ? (
            <span className={styles.roleChip} title={m.role ?? undefined}>
              {m.roleShort}
            </span>
          ) : null}
        </span>
        <span className={styles.cardInfo}>
          <span className={styles.lastName}>{m.lastName}</span>
          <span className={styles.firstName}>{m.firstName}</span>
          <span className={styles.partyLine}>
            <span className={styles.partySwatch} aria-hidden="true" />
            {m.party?.name ?? "—"}
          </span>
        </span>
      </button>
    </li>
  );
}
