import type { ReactNode } from "react";
import styles from "./ui.module.css";
import { Reveal } from "../motion/Reveal";

interface SectionHeaderProps {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  tone?: "light" | "dark";
}

/** Uppercase blue title + gold ornament rule — the official site's section heading, tightened. */
export function SectionHeader({ id, title, subtitle, action, tone = "light" }: SectionHeaderProps) {
  return (
    <Reveal className={`${styles.header} ${tone === "dark" ? styles.dark : ""}`}>
      <div className={styles.titleWrap}>
        <span className={styles.ornament} aria-hidden="true" />
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </Reveal>
  );
}
