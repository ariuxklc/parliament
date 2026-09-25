import styles from "./activity.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Reveal } from "../../motion/Reveal";
import { ScheduleColumns } from "./ScheduleColumns";
import { ArrowUpRight } from "../../ui/icons";
import type { Loaded, VoteSummary, WeeklySchedule } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { officialUrl } from "@/lib/site";

interface ActivitySectionProps {
  schedule: Loaded<WeeklySchedule | null>;
  votes: Loaded<VoteSummary[]>;
}

/** "…төслийг эцэслэн батлах санал хураалт явуулъя." → "…төслийг эцэслэн батлах" (the motion without the procedural tail). */
function motionText(motion: string): string {
  const m = motion.replace(/\s*санал хураалт явуулъя\.?\s*$/i, "").replace(/[.\s]+$/, "");
  return m.length > 8 ? m : motion;
}

export function ActivitySection({ schedule, votes }: ActivitySectionProps) {
  const s = schedule.ok ? schedule.data : null;
  const range = s ? `${formatDate(s.startDate)}–${formatDate(s.endDate).slice(5)}` : "";
  const recent = votes.ok ? votes.data.slice(0, 3) : [];

  return (
    <section id="odoo" className={styles.section} aria-labelledby="odoo-title">
      <div className="container">
        <SectionHeader
          id="odoo-title"
          title={t.activity.title}
          subtitle={s ? t.activity.subtitle(range) : undefined}
          action={s?.fileUrl ? <OfficialSourceLink href={s.fileUrl} variant="plain">{t.activity.download}</OfficialSourceLink> : null}
        />

        {s ? (
          <Reveal>
            <ScheduleColumns days={s.days} />
          </Reveal>
        ) : (
          <EmptyState title={t.activity.noSchedule} />
        )}

        {recent.length ? (
          <Reveal className={styles.votes} index={1}>
            <div className={styles.votesHead}>
              <h3>{t.activity.votesTitle}</h3>
              <p>{formatDate(recent[0].date)}</p>
            </div>
            <ol className={styles.voteList}>
              {recent.map((v) => (
                <li key={v.id}>
                  <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.vote}>
                    <span className={styles.motion}>{motionText(v.motion)}</span>
                    <span className={`tabular ${styles.tally}`}>
                      <span className="visually-hidden">{t.activity.votesFor} </span>
                      {v.forCount}
                      <span className={styles.tallySep} aria-hidden="true">:</span>
                      <span className="visually-hidden">, {t.activity.votesAgainst} </span>
                      {v.againstCount}
                    </span>
                    <span className={styles.result} data-result={v.resultKey}>
                      {v.resultLabel}
                    </span>
                    <span className="visually-hidden"> {t.common.opensInNewTab}</span>
                  </a>
                </li>
              ))}
            </ol>
            <a href={officialUrl.votes()} target="_blank" rel="noopener noreferrer" className={styles.allVotes}>
              {t.activity.allVotes}
              <ArrowUpRight size={13} />
              <span className="visually-hidden"> {t.common.opensInNewTab}</span>
            </a>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
