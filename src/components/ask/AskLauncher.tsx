"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AskParliamentChat } from "../AskParliamentChat";
import { ArrowUpRight, Close } from "../ui/icons";
import styles from "./launcher.module.css";

/**
 * Site-wide entry point to Ask Parliament AI: a floating button that opens the global assistant in a
 * side panel. Hidden on pages that already embed the assistant (/ask, /laws/[id]).
 */
export function AskLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      buttonRef.current?.focus();
    };
  }, [open]);

  if (pathname?.startsWith("/ask") || pathname?.startsWith("/laws/")) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.fab}
        aria-expanded={open}
        aria-controls="ask-parliament-panel"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <span className={styles.fabMark} aria-hidden="true">
          ?
        </span>
        <span>
          <strong>УИХ-аас асуух</strong>
          <small>Ask Parliament AI</small>
        </span>
      </button>

      {mounted ? (
        <div className={styles.overlay} data-open={open} aria-hidden={!open}>
          <div className={styles.scrim} onClick={() => setOpen(false)} />
          <div id="ask-parliament-panel" className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="ask-panel-title">
            <header className={styles.panelHead}>
              <div>
                <p className={styles.panelEyebrow}>Ask Parliament AI</p>
                <h2 id="ask-panel-title">Албан ёсны эх сурвалжид тулгуурлана</h2>
              </div>
              <div className={styles.panelActions}>
                <Link href="/ask" className={styles.expand} onClick={() => setOpen(false)}>
                  Бүтэн хуудас <ArrowUpRight size={13} />
                </Link>
                <button type="button" className={styles.close} onClick={() => setOpen(false)}>
                  <Close size={18} />
                  <span className="visually-hidden">Хаах</span>
                </button>
              </div>
            </header>
            <div className={styles.panelBody}>{open ? <AskParliamentChat variant="panel" autoFocus /> : null}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
