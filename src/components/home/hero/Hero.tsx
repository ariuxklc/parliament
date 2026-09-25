import Image from "next/image";
import styles from "./hero.module.css";
import ui from "../../ui/ui.module.css";
import { Parallax } from "../../motion/Parallax";
import { CountUp } from "../../motion/CountUp";
import { ArrowRight, ArrowUpRight, Play } from "../../ui/icons";
import type { BillBulletinSummary, CurrentSessionInfo, Loaded, Proposal } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate, formatDateLong, formatMonthDay, formatTime, toLocalDate, weekdayOf } from "@/lib/format";
import { officialUrl } from "@/lib/site";

interface HeroProps {
  current: CurrentSessionInfo;
  openDrafts: Loaded<{ count: number; latest: Proposal[] }>;
  bulletin: Loaded<BillBulletinSummary | null>;
  today: string;
}

export function Hero({ current, openDrafts, bulletin, today }: HeroProps) {
  const { session, latestPlenary, live } = current;
  const year = Number(today.slice(0, 4));
  const plenaryDay = latestPlenary ? toLocalDate(latestPlenary.date) : null;

  return (
    <section id="top" className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.media} aria-hidden="true">
        <Parallax speed={0.22} max={90} className={styles.mediaLayer}>
          <Image src="/images/state-palace-aerial.jpg" alt="" fill priority sizes="100vw" className={styles.mediaImg} />
        </Parallax>
        <div className={styles.shade} />
      </div>

      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>
            {session ? (
              <>
                <span className={styles.pulse} data-open={session.isOpen} aria-hidden="true" />
                {session.isOpen ? t.hero.openSession : t.hero.lastSession}
              </>
            ) : null}
            <span className={styles.eyebrowDate}>{formatDateLong(today)}, {weekdayOf(today)}</span>
          </p>
          <h1 id="hero-title" className={styles.title}>
            {session ? session.label : t.hero.fallbackTitle}
          </h1>
          {session ? (
            <p className={styles.meta}>
              {t.hero.since(formatMonthDay(session.startDate))}
              <span aria-hidden="true">·</span>
              {t.hero.plenaryCount(session.meetingCount)}
            </p>
          ) : null}
          <p className={styles.lead}>{t.hero.lead}</p>
          <div className={styles.actions}>
            <a href="#huuli" className={`${ui.button} ${ui.buttonGold}`}>
              {t.hero.ctaLaws}
              <ArrowRight size={16} />
            </a>
            <a href="#gishuud" className={`${ui.button} ${ui.buttonGhostDark}`}>
              {t.hero.ctaMembers}
            </a>
            <a href="#odoo" className={`${ui.button} ${ui.buttonGhostDark}`}>
              {t.hero.ctaSchedule}
            </a>
          </div>
        </div>

        <ul className={styles.tiles} aria-label="Одоогийн байдал">
          {latestPlenary ? (
            <li className={styles.tile}>
              <p className={styles.tileLabel}>
                {live?.isLive ? (
                  <span className={styles.liveBadge}>
                    <span aria-hidden="true" />
                    {t.hero.live}
                  </span>
                ) : (
                  t.hero.latestPlenary
                )}
              </p>
              <p className={styles.tileValue}>
                {plenaryDay ? `${formatDate(plenaryDay)}, ${weekdayOf(plenaryDay)}` : ""}
              </p>
              <p className={styles.tileHint}>
                {[latestPlenary.location, formatTime(latestPlenary.date) ? `${formatTime(latestPlenary.date)}-д эхэлсэн` : null].filter(Boolean).join(" · ")}
              </p>
              <div className={styles.tileLinks}>
                <a href={latestPlenary.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {t.hero.meetingInfo}
                  <ArrowUpRight size={13} />
                </a>
                {live ? (
                  <a href={live.videoUrl} target="_blank" rel="noopener noreferrer">
                    <Play size={12} />
                    {live.isLive ? t.hero.watchLive : t.hero.watchRecording}
                  </a>
                ) : null}
              </div>
            </li>
          ) : null}

          {openDrafts.ok ? (
            <li className={styles.tile}>
              <p className={styles.tileLabel}>{t.hero.openDrafts}</p>
              <p className={styles.tileNumber}>
                <CountUp value={openDrafts.data.count} />
              </p>
              <p className={styles.tileHint}>{t.hero.openDraftsHint(year)}</p>
              <div className={styles.tileLinks}>
                <a href={officialUrl.lawforumDrafts()} target="_blank" rel="noopener noreferrer">
                  {t.hero.giveOpinion}
                  <ArrowUpRight size={13} />
                </a>
              </div>
            </li>
          ) : null}

          {bulletin.ok && bulletin.data ? (
            <li className={styles.tile}>
              <p className={styles.tileLabel}>{t.hero.bulletin}</p>
              <p className={styles.tileNumber}>
                <CountUp value={bulletin.data.total} />
              </p>
              <p className={styles.tileHint}>{t.hero.bulletinHint(formatDate(bulletin.data.snapshotAt))}</p>
              <div className={styles.tileLinks}>
                <a href={bulletin.data.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {t.hero.bulletinLink}
                  <ArrowUpRight size={13} />
                </a>
              </div>
            </li>
          ) : null}
        </ul>
      </div>
      <p className={`container ${styles.credit}`}>Зураг: Төрийн ордон, Сүхбаатарын талбай — УИХ-ын Тамгын газрын танилцуулгаас</p>
    </section>
  );
}
