import type { ReactNode } from "react";
import styles from "./ui.module.css";
import { ArrowUpRight } from "./icons";
import { t } from "@/lib/i18n";

interface OfficialSourceLinkProps {
  href: string;
  children: ReactNode;
  tone?: "light" | "dark";
  variant?: "pill" | "plain";
  className?: string;
}

/** Link to an official Parliament page. Always opens in a new tab and says so to screen readers. */
export function OfficialSourceLink({ href, children, tone = "light", variant = "pill", className }: OfficialSourceLinkProps) {
  const cls = [
    styles.sourceLink,
    tone === "dark" ? styles.sourceLinkDark : "",
    variant === "plain" ? styles.sourceLinkPlain : "",
    className ?? "",
  ].join(" ");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
      <ArrowUpRight size={14} />
      <span className="visually-hidden"> {t.common.opensInNewTab}</span>
    </a>
  );
}

export function SourceNote({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return <p className={`${styles.sourceNote} ${tone === "dark" ? styles.sourceNoteDark : ""}`}>{children}</p>;
}
