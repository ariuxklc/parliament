import styles from "./stats.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { Reveal } from "../../motion/Reveal";
import { CountUp } from "../../motion/CountUp";
import { Hemicycle } from "./Hemicycle";
import type { AttendanceOverviewStat, Loaded, ParliamentComposition } from "@/lib/types";
import { t } from "@/lib/i18n";
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
            <Reveal className={styles.seats}>
              <h3 className="visually-hidden">{t.stats.seats}</h3>
              <Hemicycle composition={c} />
            </Reveal>
          ) : null}

          <dl className={styles.figures}>
            {c && women ? (
              <Reveal className={styles.figure} index={1}>
                <dt>{t.stats.women}</dt>
                <dd className={styles.big}>
                  <CountUp value={women.count} />
                </dd>
                <dd className={styles.note}>{t.stats.ofMembers(c.totalMembers)}</dd>
              </Reveal>
            ) : null}
            {c && c.firstTermCount !== null ? (
              <Reveal className={styles.figure} index={2}>
                <dt>{t.stats.firstTerm}</dt>
                <dd className={styles.big}>
                  <CountUp value={c.firstTermCount} />
                </dd>
                <dd className={styles.note}>{t.stats.ofMembers(c.totalMembers)}</dd>
              </Reveal>
            ) : null}
            {a ? (
              <Reveal className={styles.figure} index={3}>
                <dt>{t.stats.attendance}</dt>
                <dd className={styles.big}>
                  <CountUp value={a.averagePercentage} decimals={1} suffix="%" />
                </dd>
                <dd className={styles.note}>
                  {a.firstSessionLabel ? t.stats.attendanceScope(a.firstSessionLabel, a.meetingCount) : null}. {t.members.attendanceDef}
                </dd>
              </Reveal>
            ) : null}
          </dl>
        </div>
        <p className={styles.source}>
          {t.stats.source}: <OfficialSourceLink href={officialUrl.memberList()} variant="plain">УИХ-ын гишүүд</OfficialSourceLink>
          {a ? (
            <>
              {" · "}
              <OfficialSourceLink href={officialUrl.attendance()} variant="plain">Хуралдааны ирц</OfficialSourceLink>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
