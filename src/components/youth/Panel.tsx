import type { ReactNode } from "react";
import styles from "./forms.module.css";

/** A titled surface on the youth pages. */
export function Panel({ id, title, aside, children, className }: { id?: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={className ?? styles.panel} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className={styles.panelHead}>
        <h2 id={id ? `${id}-h` : undefined} className={styles.h2}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
