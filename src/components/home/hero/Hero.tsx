import Image from "next/image";
import styles from "./hero.module.css";
import ui from "../../ui/ui.module.css";
import { Parallax } from "../../motion/Parallax";
import { ArrowRight, Play } from "../../ui/icons";
import { ReelStack } from "./ReelStack";
import type { CurrentSessionInfo } from "@/lib/types";
import type { Reel } from "@/lib/reels";
import { t } from "@/lib/i18n";
import { formatDateLong, formatMonthDay, toLocalDate, weekdayOf } from "@/lib/format";

interface HeroProps {
  current: CurrentSessionInfo;
  reels: Reel[];
  today: string;
}

/** Session in one line of type, two ways in, and the reels. Everything else lives further down the page. */
export function Hero({ current, reels, today }: HeroProps) {
  const { session, latestPlenary, live } = current;
  const plenaryDay = latestPlenary ? toLocalDate(latestPlenary.date) : null;

  return (
    <section id="top" className={styles.hero} aria-labelledby="hero-title" data-reels={reels.length > 0}>
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
              <span className={styles.status}>
                <span className={styles.pulse} data-open={session.isOpen} aria-hidden="true" />
                {session.isOpen ? t.hero.openSession : t.hero.lastSession}
              </span>
            ) : null}
            <span className={styles.today}>
              {formatDateLong(today)}, {weekdayOf(today)}
            </span>
          </p>
          <h1 id="hero-title" className={styles.title}>
            {session ? session.label : t.hero.fallbackTitle}
          </h1>
          {session ? (
            <p className={styles.meta}>
              {t.hero.since(formatMonthDay(session.startDate))} · {t.hero.plenaryCount(session.meetingCount)}
            </p>
          ) : null}
          <p className={styles.lead}>{t.hero.lead}</p>
          <div className={styles.actions}>
            <a href="#huuli" className={`${ui.button} ${ui.buttonGold}`}>
              {t.hero.ctaLaws}
              <ArrowRight size={16} />
            </a>
            <a href="#odoo" className={`${ui.button} ${ui.buttonGhostDark}`}>
              {t.hero.ctaSchedule}
            </a>
          </div>

          {latestPlenary && plenaryDay ? (
            <p className={styles.last}>
              <span className={styles.lastLabel}>{live?.isLive ? t.hero.live : t.hero.latestPlenary}</span>
              <span>
                {formatMonthDay(plenaryDay)}, {weekdayOf(plenaryDay)}
              </span>
              {live ? (
                <a href={live.videoUrl} target="_blank" rel="noopener noreferrer" className={styles.lastLink} data-live={live.isLive}>
                  <Play size={11} />
                  {live.isLive ? t.hero.watchLive : t.hero.watchRecording}
                  <span className="visually-hidden"> {t.common.opensInNewTab}</span>
                </a>
              ) : (
                <a href={latestPlenary.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.lastLink}>
                  {t.hero.meetingInfo}
                  <span className="visually-hidden"> {t.common.opensInNewTab}</span>
                </a>
              )}
            </p>
          ) : null}
        </div>

        {reels.length ? <ReelStack reels={reels} /> : null}
      </div>
      <p className={styles.credit}>Зураг: Төрийн ордон — УИХ-ын Тамгын газар</p>
      <div className={`meander ${styles.edge}`} aria-hidden="true" />
    </section>
  );
}
