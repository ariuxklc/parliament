"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import styles from "./members.module.css";
import ui from "../../ui/ui.module.css";
import type { MemberRoster, MemberSummary } from "@/lib/types";
import { t } from "@/lib/i18n";
import { MemberCard } from "./MemberCard";
import { MemberShowcase } from "./MemberShowcase";
import { prefetchMemberProfile, useMemberProfile } from "./useMemberProfile";
import { Close, Search } from "../../ui/icons";

const STEP = 12;

/**
 * Roster grid. Nothing opens on hover (hovering only warms the profile cache); pressing a person opens
 * their card in a dialog — centred on desktop, a bottom sheet on phones.
 */
export function MemberSection({ roster }: { roster: MemberRoster }) {
  const [party, setParty] = useState<number | null>(null);
  const [committee, setCommittee] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [visible, setVisible] = useState(STEP);
  const [openId, setOpenId] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase("mn");
    return roster.members.filter(
      (m) =>
        (party === null || m.party?.id === party) &&
        (committee === null || m.committeeIds.includes(committee)) &&
        (!q || `${m.lastName} ${m.firstName} ${m.shortName}`.toLocaleLowerCase("mn").includes(q)),
    );
  }, [roster.members, party, committee, deferredQuery]);

  useEffect(() => setVisible(STEP), [party, committee, deferredQuery]);

  const byId = useMemo(() => new Map(roster.members.map((m) => [m.id, m])), [roster.members]);
  const { profile, state } = useMemberProfile(openId);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (openId !== null && !d.open) d.showModal();
    if (openId === null && d.open) d.close();
  }, [openId]);

  const warm = (m: MemberSummary) => void prefetchMemberProfile(m.id).catch(() => {});
  const open = (m: MemberSummary) => setOpenId(m.id);
  const openMember = openId !== null ? byId.get(openId) : undefined;

  return (
    <div>
      <div>
        <div className={styles.filters}>
          <div className={styles.partyChips} role="group" aria-label="Нам">
            <button type="button" aria-pressed={party === null} onClick={() => setParty(null)} className={styles.chip}>
              {t.members.all}
              <span className="tabular">{roster.members.length}</span>
            </button>
            {roster.parties.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={party === p.id}
                onClick={() => setParty(party === p.id ? null : p.id)}
                className={styles.chip}
                style={{ ["--party" as string]: p.color }}
              >
                <span className={styles.partySwatch} aria-hidden="true" />
                {p.name}
                <span className="tabular">{p.count}</span>
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            <label className={styles.field}>
              <span className="visually-hidden">{t.members.committees}</span>
              <select value={committee ?? ""} onChange={(e) => setCommittee(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t.members.committeeAll}</option>
                {roster.committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${styles.field} ${styles.search}`}>
              <Search size={16} />
              <span className="visually-hidden">{t.members.searchLabel}</span>
              <input type="search" value={query} placeholder={t.members.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
        </div>

        {filtered.length ? (
          <ul className={styles.grid} aria-label={t.members.title}>
            {filtered.slice(0, visible).map((m, i) => (
              <MemberCard key={m.id} member={m} index={i % STEP} selected={m.id === openId} onPreview={warm} onSelect={open} />
            ))}
          </ul>
        ) : (
          <p className={styles.none} role="status">
            {t.members.none}
          </p>
        )}

        <div className={styles.more}>
          {visible < filtered.length ? (
            <>
              <button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => setVisible((v) => v + STEP)}>
                {t.members.showMore}
              </button>
              <button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => setVisible(filtered.length)}>
                {t.members.showAll(filtered.length)}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className={styles.sheet}
        onClose={() => setOpenId(null)}
        onClick={(e) => e.target === dialogRef.current && setOpenId(null)}
        aria-labelledby="member-sheet-name"
      >
        {openMember ? (
          <>
            <button type="button" className={styles.sheetClose} onClick={() => setOpenId(null)}>
              <Close size={20} />
              <span className="visually-hidden">{t.members.close}</span>
            </button>
            <MemberShowcase member={openMember} profile={profile} state={state} headingId="member-sheet-name" />
          </>
        ) : null}
      </dialog>
    </div>
  );
}
