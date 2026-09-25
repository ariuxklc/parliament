"use client";

import Image from "next/image";
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

/** Desktop = a real pointer that can hover and room for the side showcase. */
function useDesktopMode() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1100px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export function MemberSection({ roster }: { roster: MemberRoster }) {
  const [party, setParty] = useState<number | null>(null);
  const [committee, setCommittee] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [visible, setVisible] = useState(STEP);
  const [selectedId, setSelectedId] = useState<number>(roster.members[0]?.id);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const desktop = useDesktopMode();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewTimer = useRef<number | undefined>(undefined);

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
  const shownId = previewId ?? selectedId;
  const shown: MemberSummary | undefined = byId.get(shownId);
  const { profile, state } = useMemberProfile(desktop ? (shown?.id ?? null) : sheetId);

  // warm the cache for the default member so the first render of the showcase is complete
  useEffect(() => {
    if (selectedId) void prefetchMemberProfile(selectedId).catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (sheetId !== null && !d.open) d.showModal();
    if (sheetId === null && d.open) d.close();
  }, [sheetId]);

  const preview = (m: MemberSummary) => {
    void prefetchMemberProfile(m.id).catch(() => {});
    if (!desktop) return;
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreviewId(m.id), 70); // avoid flicker while sweeping across the grid
  };
  const endPreview = () => {
    window.clearTimeout(previewTimer.current);
    setPreviewId(null);
  };
  const select = (m: MemberSummary) => {
    if (desktop) {
      setSelectedId(m.id);
      setPreviewId(null);
    } else {
      setSheetId(m.id);
    }
  };

  const sheetMember = sheetId !== null ? byId.get(sheetId) : undefined;

  return (
    <div className={styles.layout}>
      <div className={styles.rosterCol}>
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
                {p.logo ? <Image src={p.logo} alt="" width={18} height={18} className={styles.chipLogo} /> : <span className={styles.partySwatch} />}
                {p.name}
                <span className="tabular">{p.count}</span>
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            <label className={styles.darkField}>
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
            <label className={`${styles.darkField} ${styles.darkSearch}`}>
              <Search size={16} />
              <span className="visually-hidden">{t.members.searchLabel}</span>
              <input type="search" value={query} placeholder={t.members.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
        </div>

        {filtered.length ? (
          <ul className={styles.grid} onPointerLeave={endPreview} aria-label={t.members.title}>
            {filtered.slice(0, visible).map((m, i) => (
              <MemberCard key={m.id} member={m} index={i % STEP} selected={desktop && m.id === selectedId} onPreview={preview} onSelect={select} />
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
              <button type="button" className={`${ui.button} ${ui.buttonGhostDark}`} onClick={() => setVisible((v) => v + STEP)}>
                {t.members.showMore}
              </button>
              <button type="button" className={`${ui.button} ${ui.buttonGhostDark}`} onClick={() => setVisible(filtered.length)}>
                {t.members.showAll(filtered.length)}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {desktop && shown ? (
        <div className={styles.showcaseCol}>
          <MemberShowcase member={shown} profile={profile} state={state} headingId="member-showcase-name" />
        </div>
      ) : null}

      <dialog ref={dialogRef} className={styles.sheet} onClose={() => setSheetId(null)} onClick={(e) => e.target === dialogRef.current && setSheetId(null)} aria-labelledby="member-sheet-name">
        {sheetMember ? (
          <>
            <button type="button" className={styles.sheetClose} onClick={() => setSheetId(null)}>
              <Close size={20} />
              <span className="visually-hidden">{t.members.close}</span>
            </button>
            <MemberShowcase member={sheetMember} profile={profile} state={state} headingId="member-sheet-name" />
          </>
        ) : null}
      </dialog>
    </div>
  );
}
