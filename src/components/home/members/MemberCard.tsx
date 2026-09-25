"use client";

import Image from "next/image";
import { useRef, type PointerEvent } from "react";
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
 * Compact roster card. Default state shows portrait, name, party and role.
 * On hover/focus it lifts, the portrait pushes in, a spotlight follows the pointer and the
 * committee line slides up — the "player card" moment. Neighbours recede via CSS `:has()`.
 */
export function MemberCard({ member: m, selected, index, onPreview, onSelect }: MemberCardProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <li className={styles.cardItem} style={{ ["--i" as string]: index }}>
      <button
        ref={ref}
        type="button"
        className={styles.card}
        data-selected={selected}
        aria-pressed={selected}
        aria-label={t.members.select(`${m.lastName} ${m.firstName}`)}
        onPointerEnter={(e) => e.pointerType === "mouse" && onPreview(m)}
        onPointerMove={onMove}
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
          <span className={styles.spotlight} aria-hidden="true" />
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
          {m.committees[0] ? <span className={styles.committeeLine}>{m.committees[0]}</span> : null}
        </span>
      </button>
    </li>
  );
}
