"use client";

import Image from "next/image";
import styles from "./members.module.css";
import type { MemberProfile, MemberSummary } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatNumber, formatPercent } from "@/lib/format";
import { CountUp } from "../../motion/CountUp";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";

const ATTENDANCE_COLORS: Record<string, string> = {
  on_time: "var(--blue-800)",
  late: "#6b8fd6",
  leave: "var(--gold-500)",
  medical_leave: "#e8d27a",
  foreign_trip: "#9aa6bd",
  local_trip: "#c3cad8",
  absent: "var(--red-600)",
  other: "#d9dde4",
};

interface MemberShowcaseProps {
  member: MemberSummary;
  profile: MemberProfile | null;
  state: "loading" | "ready" | "error";
  headingId?: string;
}

/**
 * Expanded "player card": larger portrait over the member's official cover image, then facts that
 * animate in — constituency, committees and plenary attendance. Only official data is shown.
 */
export function MemberShowcase({ member: m, profile, state, headingId }: MemberShowcaseProps) {
  const party = profile?.party ?? m.party;
  const committees = profile ? profile.positions.filter((p) => p.unitType === "COMMITTEE") : [];
  const sub = profile ? profile.positions.filter((p) => p.unitType === "SUBCOMMITTEE" || p.unitType === "TEMPORARY_COMMITTEE") : [];

  return (
    <article className={styles.showcase} key={m.id} style={{ ["--party" as string]: party?.color ?? "var(--ink-500)" }} aria-labelledby={headingId}>
      <div className={styles.showcaseMedia}>
        <div className={styles.coverWrap}>
          {profile?.cover ? <Image src={profile.cover} alt="" fill sizes="420px" className={styles.showcaseCover} /> : null}
          <div className={styles.showcaseShade} />
        </div>
        <div className={styles.showcasePortrait}>
          {m.portrait ? <Image src={m.portrait} alt={`${m.lastName} ${m.firstName}`} fill sizes="160px" className={styles.portraitImg} /> : null}
        </div>
      </div>

      <div className={styles.showcaseBody}>
        {m.role ? <p className={styles.showcaseRole}>{m.role}</p> : null}
        <h3 id={headingId} className={styles.showcaseName}>
          <span>{m.lastName}</span> {m.firstName}
        </h3>
        {party ? (
          <p className={styles.showcaseParty}>
            {party.logo ? <Image src={party.logo} alt="" width={22} height={22} className={styles.partyLogo} /> : null}
            {party.name}
          </p>
        ) : null}

        <dl className={styles.facts} data-state={state}>
          <div className={styles.fact} style={{ ["--d" as string]: 0 }}>
            <dt>{t.members.constituency}</dt>
            <dd>
              {state === "loading" ? (
                <span className={styles.skeleton} />
              ) : profile?.constituency?.name ? (
                <>
                  {profile.constituency.number ? `${profile.constituency.number}-р тойрог, ` : ""}
                  {profile.constituency.name}
                </>
              ) : profile?.constituency?.system ? (
                profile.constituency.system
              ) : (
                "—"
              )}
            </dd>
            {profile?.constituency?.name && profile.constituency.system ? <dd className={styles.factSub}>{profile.constituency.system}</dd> : null}
          </div>

          <div className={styles.fact} style={{ ["--d" as string]: 1 }}>
            <dt>{t.members.committees}</dt>
            <dd>
              {state === "loading" ? (
                <span className={styles.skeleton} />
              ) : committees.length ? (
                <ul className={styles.factList}>
                  {committees.map((c) => (
                    <li key={c.unitId}>
                      {c.unitName}
                      {/^дарга$/i.test(c.title) || /^дэд дарга$/i.test(c.title) ? <strong> · {c.title}</strong> : null}
                    </li>
                  ))}
                  {sub.length ? <li className={styles.factSub}>+ {sub.length} дэд/түр хороо</li> : null}
                </ul>
              ) : (
                (m.committees[0] ?? "—")
              )}
            </dd>
          </div>

          <div className={`${styles.fact} ${styles.factAttendance}`} style={{ ["--d" as string]: 2 }}>
            <dt>{t.members.attendance}</dt>
            {state === "loading" ? (
              <dd>
                <span className={styles.skeleton} />
              </dd>
            ) : profile?.attendance ? (
              <>
                <dd className={styles.attendanceNumber}>
                  <CountUp value={profile.attendance.percentage} decimals={1} suffix="%" durationMs={900} trigger="mount" />
                </dd>
                <dd className={styles.attendanceBar} role="img" aria-label={profile.attendance.breakdown.map((b) => `${b.label} ${b.count}`).join(", ")}>
                  {profile.attendance.breakdown.map((b) => (
                    <span key={b.key} style={{ flexGrow: b.count, background: ATTENDANCE_COLORS[b.key] ?? "#ccc" }} title={`${b.label}: ${b.count}`} />
                  ))}
                </dd>
                <dd className={styles.factSub}>
                  {t.members.attendanceOf(profile.attendance.present, profile.attendance.total)} · {profile.attendance.scopeLabel}
                </dd>
                <dd>
                  <ul className={styles.legend}>
                    {profile.attendance.breakdown.map((b) => (
                      <li key={b.key}>
                        <span style={{ background: ATTENDANCE_COLORS[b.key] ?? "#ccc" }} aria-hidden="true" />
                        {b.label} <strong className="tabular">{formatNumber(b.count)}</strong>
                      </li>
                    ))}
                  </ul>
                </dd>
                <dd className={styles.factDef}>{t.members.attendanceDef}</dd>
              </>
            ) : (
              <dd>{state === "error" ? t.members.error : "—"}</dd>
            )}
          </div>
        </dl>

        <div className={styles.showcaseFoot}>
          <OfficialSourceLink href={m.sourceUrl}>
            {t.members.officialPage}
          </OfficialSourceLink>
          <span className={styles.showcaseSource}>{t.members.source}</span>
        </div>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {state === "ready" && profile?.attendance ? `${t.members.attendance}: ${formatPercent(profile.attendance.percentage)}` : ""}
      </span>
    </article>
  );
}
