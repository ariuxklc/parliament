"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./reels.module.css";
import type { Reel } from "@/lib/reels";
import { appUrl } from "@/lib/site";
import { ArrowLeft, ArrowRight, ArrowUpRight, Play } from "../../ui/icons";

const Pause = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
const Speaker = ({ muted }: { muted: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M11 5 6 9H3v6h3l5 4z" />
    {muted ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
  </svg>
);

/** Where a card sits relative to the one on top: 0 = playing, 1–2 = waiting behind, "prev" = just left. */
function position(i: number, index: number, n: number): string {
  const rel = (i - index + n) % n;
  if (rel === 0) return "0";
  if (n > 2 && rel === n - 1) return "prev";
  return rel <= 2 ? String(rel) : "rest";
}

/**
 * Homepage reels: short vertical videos stacked like cards on a desk. The top card plays; the next
 * two wait behind it; moving on sends the top card off to the left. Files advance when they end;
 * embeds (which cannot report their end) advance after `seconds`, unless the viewer is hovering,
 * has clicked into the video, pressed pause, or scrolled away. Reduced motion: nothing moves by itself.
 */
export function ReelStack({ reels }: { reels: Reel[] }) {
  const n = reels.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [engaged, setEngaged] = useState(false); // clicked into the current embed: let them watch
  const [visible, setVisible] = useState(true);
  const [muted, setMuted] = useState(true);
  const [fileProgress, setFileProgress] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const current = reels[index];
  const isFile = current?.kind === "file";
  const holding = paused || hover || engaged || !visible;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + n) % n);
      setEngaged(false);
      setFileProgress(0);
    },
    [n],
  );

  // Reduced motion: start paused, the viewer moves on themselves.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
  }, []);

  // Stop when scrolled out of view or the tab is hidden.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && document.visibilityState === "visible"), { threshold: 0.35 });
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible" && el.getBoundingClientRect().bottom > 0);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // A click inside a cross-origin iframe moves focus out of this window: treat it as "watching".
  useEffect(() => {
    const onBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement && frameRefs.current.includes(document.activeElement as HTMLIFrameElement)) setEngaged(true);
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  // The local video follows play/pause/visibility.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || !visible) v.pause();
    else void v.play().catch(() => setPaused(true));
  }, [paused, visible, index]);

  if (!n) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  };

  return (
    <div ref={rootRef} className={styles.reels} role="region" aria-roledescription="carousel" aria-label="Богино видео" onKeyDown={onKeyDown}>
      {n > 1 ? (
        <div className={styles.topRow}>
          <ol className={styles.progress} aria-label="Бичлэгүүд">
            {reels.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => go(i - index)}
                  aria-label={`${i + 1}-р бичлэг: ${r.title}`}
                  aria-current={i === index ? "true" : undefined}
                >
                  <span className={styles.track}>
                    {i < index ? <span className={styles.fill} data-state="done" /> : null}
                    {i === index ? (
                      isFile ? (
                        <span className={styles.fill} data-state="file" style={{ transform: `scaleX(${fileProgress})` }} />
                      ) : (
                        <span
                          key={`${r.id}-${index}`}
                          className={styles.fill}
                          data-state="timed"
                          data-holding={holding}
                          style={{ animationDuration: `${r.seconds}s` }}
                          onAnimationEnd={() => go(1)}
                        />
                      )
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={styles.pause}
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? "Үргэлжлүүлэх" : "Түр зогсоох"}
          >
            {paused ? <Play size={12} /> : <Pause />}
          </button>
        </div>
      ) : null}

      <div className={styles.stage}>
        {n > 1 ? (
          <button type="button" className={`${styles.arrow} ${styles.arrowPrev}`} onClick={() => go(-1)} aria-label="Өмнөх бичлэг">
            <ArrowLeft size={18} />
          </button>
        ) : null}
        <div
          className={styles.stack}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          {reels.map((r, i) => {
            const pos = position(i, index, n);
            const active = pos === "0";
            return (
              <article key={r.id} className={styles.card} data-pos={pos} data-kind={r.kind} aria-hidden={!active} inert={!active}>
                <div className={styles.cover}>
                  {r.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.poster} alt="" className={styles.poster} />
                  ) : null}
                  <span className={styles.coverPlay} aria-hidden="true">
                    <Play size={16} />
                  </span>
                  <span className={styles.coverTitle}>{r.title}</span>
                  {r.source ? <span className={styles.coverSource}>{r.source}</span> : null}
                </div>

                {active && r.kind === "file" ? (
                  <video
                    ref={videoRef}
                    className={styles.media}
                    src={r.embedUrl}
                    poster={r.poster ?? undefined}
                    muted={muted}
                    playsInline
                    autoPlay={!paused}
                    preload="metadata"
                    onTimeUpdate={(e) => {
                      const v = e.currentTarget;
                      if (v.duration) setFileProgress(v.currentTime / v.duration);
                    }}
                    onEnded={() => (n > 1 ? go(1) : setPaused(true))}
                    onClick={() => setPaused((p) => !p)}
                    aria-label={r.title}
                  />
                ) : null}

                {active && r.kind !== "file" ? (
                  <iframe
                    ref={(el) => {
                      frameRefs.current[i] = el;
                    }}
                    className={styles.media}
                    src={r.embedUrl}
                    title={r.title}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    scrolling="no"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                  />
                ) : null}

                {active && r.kind === "file" ? (
                  <button
                    type="button"
                    className={styles.mute}
                    onClick={() => setMuted((m) => !m)}
                    aria-pressed={!muted}
                    aria-label={muted ? "Дууг нээх" : "Дууг хаах"}
                  >
                    <Speaker muted={muted} />
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
        {n > 1 ? (
          <button type="button" className={`${styles.arrow} ${styles.arrowNext}`} onClick={() => go(1)} aria-label="Дараагийн бичлэг">
            <ArrowRight size={18} />
          </button>
        ) : null}
      </div>

      <div className={styles.below}>
        <div className={styles.caption} aria-live="polite">
          <p className={styles.title}>{current.title}</p>
          <p className={styles.meta}>
            {current.billId ? (
              <Link href={appUrl.bill(current.billId)} className={styles.billLink}>
                Төслийг үзэх
                <ArrowRight size={14} />
              </Link>
            ) : null}
            {current.sourceUrl ? (
              <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                {current.source ?? (current.kind === "youtube" ? "YouTube" : "Instagram")}
                <ArrowUpRight size={12} />
                <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
              </a>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
