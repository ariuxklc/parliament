import styles from "./activity.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink, SourceNote } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Reveal } from "../../motion/Reveal";
import { ScheduleColumns } from "./ScheduleColumns";
import { Download } from "../../ui/icons";
import type { BillBulletinSummary, Loaded, VoteSummary, WeeklySchedule } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/format";
import { officialUrl } from "@/lib/site";

interface ActivitySectionProps {
  schedule: Loaded<WeeklySchedule | null>;
  votes: Loaded<VoteSummary[]>;
  bulletin: Loaded<BillBulletinSummary | null>;
}

export function ActivitySection({ schedule, votes, bulletin }: ActivitySectionProps) {
  const s = schedule.ok ? schedule.data : null;
  const range = s ? `${formatDate(s.startDate)}–${formatDate(s.endDate).slice(5)}` : "";

  return (
    <section id="odoo" className={styles.section} aria-labelledby="odoo-title">
      <div className="container">
        <SectionHeader
          id="odoo-title"
          title={t.activity.title}
          subtitle={s ? t.activity.subtitle(range) : undefined}
          action={
            s?.fileUrl ? (
              <OfficialSourceLink href={s.fileUrl}>
                <Download size={14} />
                {t.activity.download}
              </OfficialSourceLink>
            ) : null
          }
        />

        {s ? (
          <Reveal>
            <ScheduleColumns days={s.days} />
          </Reveal>
        ) : (
          <EmptyState title={t.activity.noSchedule} />
        )}

        <div className={styles.lower}>
          <Reveal className={styles.panel} index={1}>
            <div className={styles.panelHead}>
              <h3>{t.activity.votesTitle}</h3>
              <OfficialSourceLink href={officialUrl.votes()} variant="plain">
                {t.activity.allVotes}
              </OfficialSourceLink>
            </div>
            {votes.ok && votes.data.length ? (
              <>
                <p className={styles.panelMeta}>
                  {votes.data[0].meetingTitle.charAt(0) + votes.data[0].meetingTitle.slice(1).toLowerCase()} · {formatDate(votes.data[0].date)}
                </p>
                <ol className={styles.votes}>
                  {votes.data.map((v) => {
                    const forPct = (v.forCount / v.totalVoted) * 100;
                    return (
                      <li key={v.id}>
                        <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.vote}>
                          <p className={styles.voteMotion}>{v.motion}</p>
                          <div className={styles.voteBar} role="img" aria-label={`${t.activity.votesFor} ${v.forCount}, ${t.activity.votesAgainst} ${v.againstCount}`}>
                            <span style={{ width: `${forPct}%` }} />
                          </div>
                          <div className={styles.voteNumbers}>
                            <span>
                              <span className={styles.forDot} aria-hidden="true" />
                              {t.activity.votesFor} <strong className="tabular">{v.forCount}</strong>
                            </span>
                            <span>
                              <span className={styles.againstDot} aria-hidden="true" />
                              {t.activity.votesAgainst} <strong className="tabular">{v.againstCount}</strong>
                            </span>
                            <span className={styles.voteResult} data-result={v.resultKey}>
                              {v.resultLabel}
                            </span>
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ol>
                <SourceNote>{t.activity.votesNote}</SourceNote>
              </>
            ) : (
              <p className={styles.panelEmpty}>{t.activity.noVotes}</p>
            )}
          </Reveal>

          {bulletin.ok && bulletin.data ? (
            <Reveal className={styles.panel} index={2}>
              <div className={styles.panelHead}>
                <h3>{t.activity.bulletinTitle}</h3>
                <OfficialSourceLink href={bulletin.data.sourceUrl} variant="plain">
                  {t.common.viewAll}
                </OfficialSourceLink>
              </div>
              <p className={styles.panelMeta}>{t.activity.bulletinAsOf(formatDate(bulletin.data.snapshotAt))}</p>
              <p className={styles.bulletinTotal}>
                <strong className="tabular">{formatNumber(bulletin.data.total)}</strong> төсөл
              </p>
              <ul className={styles.bars}>
                {bulletin.data.byCategory.map((c) => (
                  <li key={c.label}>
                    <span className={styles.barLabel}>{c.label}</span>
                    <span className={styles.barTrack} aria-hidden="true">
                      <span style={{ width: `${(c.count / bulletin.data!.total) * 100}%` }} />
                    </span>
                    <span className={`tabular ${styles.barValue}`}>{c.count}</span>
                  </li>
                ))}
              </ul>
              <h4 className={styles.subhead}>{t.activity.byCommittee}</h4>
              <ul className={styles.bars} data-variant="committee">
                {bulletin.data.byCommittee.map((c) => (
                  <li key={c.label}>
                    <span className={styles.barLabel}>{c.label}</span>
                    <span className={styles.barTrack} aria-hidden="true">
                      <span style={{ width: `${(c.count / bulletin.data!.byCommittee[0].count) * 100}%` }} />
                    </span>
                    <span className={`tabular ${styles.barValue}`}>{c.count}</span>
                  </li>
                ))}
              </ul>
              <SourceNote>{t.activity.bulletinNote}</SourceNote>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}
