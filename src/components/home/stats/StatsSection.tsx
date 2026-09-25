import styles from "./stats.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { Reveal } from "../../motion/Reveal";
import { CountUp } from "../../motion/CountUp";
import { Hemicycle } from "./Hemicycle";
import type { AttendanceOverviewStat, Loaded, ParliamentComposition } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { officialUrl } from "@/lib/site";

interface StatsSectionProps {
  composition: Loaded<ParliamentComposition>;
  attendance: Loaded<AttendanceOverviewStat | null>;
}

/**
 * Only metrics with an unambiguous definition and an official source are shown.
 * Deliberately left out: age distribution (37 of 126 members recorded as "Тодорхойгүй"),
 * per-member vote breakdowns (the "not registered" category mixes several situations),
 * and the site's "at risk" attendance list (a ranking, not a fact).
 */
export function StatsSection({ composition, attendance }: StatsSectionProps) {
  if (!composition.ok && !attendance.ok) return null;
  const c = composition.ok ? composition.data : null;
  const women = c?.sex.find((s) => /эмэгтэй/i.test(s.label));
  const a = attendance.ok ? attendance.data : null;

  return (
    <section id="too" className={styles.section} aria-labelledby="too-title">
      <div className="container">
        <SectionHeader id="too-title" title={t.stats.title} subtitle={t.stats.subtitle} />
        <div className={styles.grid}>
          {c ? (
            <Reveal className={`${styles.panel} ${styles.seatsPanel}`}>
              <div className={styles.panelHead}>
                <h3>{t.stats.seats}</h3>
                <p>{t.stats.seatsNote(c.totalMembers)}</p>
              </div>
              <Hemicycle composition={c} />
              <p className={styles.source}>
                {t.stats.source}: <OfficialSourceLink href={officialUrl.memberList()} variant="plain">new.parliament.mn — УИХ-ын гишүүд</OfficialSourceLink>
              </p>
            </Reveal>
          ) : null}

          <div className={styles.tiles}>
            {c && women ? (
              <Reveal className={styles.tile} index={1}>
                <h3>{t.stats.women}</h3>
                <p className={styles.big}>
                  <CountUp value={women.count} />
                  <span>{t.stats.ofMembers(c.totalMembers)}</span>
                </p>
                <div className={styles.ratio} aria-hidden="true">
                  <span style={{ width: `${(women.count / c.totalMembers) * 100}%` }} />
                </div>
                <p className={styles.source}>{t.stats.source}: new.parliament.mn</p>
              </Reveal>
            ) : null}

            {c && c.firstTermCount !== null ? (
              <Reveal className={styles.tile} index={2}>
                <h3>{t.stats.firstTerm}</h3>
                <p className={styles.big}>
                  <CountUp value={c.firstTermCount} />
                  <span>{t.stats.ofMembers(c.totalMembers)}</span>
                </p>
                <ul className={styles.terms}>
                  {c.termBreakdown.map((tb) => (
                    <li key={tb.label}>
                      <span className={styles.termBar} style={{ ["--h" as string]: `${(tb.count / c.totalMembers) * 100}%` }} aria-hidden="true" />
                      <strong className="tabular">{tb.count}</strong>
                      <span>{tb.label}</span>
                    </li>
                  ))}
                </ul>
                <p className={styles.source}>{t.stats.source}: new.parliament.mn — сонгогдсон удаа</p>
              </Reveal>
            ) : null}

            {a ? (
              <Reveal className={styles.tile} index={3}>
                <h3>{t.stats.attendance}</h3>
                <p className={styles.big}>
                  <CountUp value={a.averagePercentage} decimals={1} suffix="%" />
                </p>
                <p className={styles.tileNote}>
                  {a.firstSessionLabel ? t.stats.attendanceScope(a.firstSessionLabel, a.meetingCount) : null}
                  {a.lastMeetingDate ? ` · ${formatDate(a.lastMeetingDate)} хүртэл` : null}
                </p>
                <p className={styles.tileNote}>{t.members.attendanceDef}</p>
                <p className={styles.source}>
                  {t.stats.source}: <OfficialSourceLink href={officialUrl.attendance()} variant="plain">Хуралдааны ирц</OfficialSourceLink>
                </p>
              </Reveal>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
