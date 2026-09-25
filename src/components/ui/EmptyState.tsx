import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function EmptyState({ title, body, actions }: { title: string; body?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={styles.empty} role="status">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {actions ? <div className={styles.emptyActions}>{actions}</div> : null}
    </div>
  );
}

export const buttonStyles = styles;
