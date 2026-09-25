import Link from "next/link";
import styles from "./legislation.module.css";
import type { Proposal } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { appUrl } from "@/lib/site";
import { TYPE_SHORT_LABEL } from "@/lib/normalize/proposals";
import { readableTitle } from "@/lib/text/readable";
import { ArrowRight } from "../../ui/icons";

interface BillCardProps {
  proposal: Proposal;
  index: number;
  showUpdated?: boolean;
}

/**
 * One proposal as a quiet row: when (left column), title, and where it is. The whole row opens our bill page
 * (/laws/{id}), which carries the official LawForum link, the stages and the 30-second explainer.
 */
export function BillCard({ proposal: p, index, showUpdated }: BillCardProps) {
  const typeLabel = TYPE_SHORT_LABEL[p.typeId] ?? p.typeTitle;
  const date = showUpdated && p.updatedAt ? p.updatedAt : p.publishedDate;
  return (
    <article className={styles.row} data-stage={p.stage} style={{ ["--i" as string]: index }}>
      <time className={styles.rowDate} dateTime={date}>
        {formatDate(date)}
        {showUpdated && p.updatedAt ? <small>шинэчилсэн</small> : null}
      </time>
      <h3 className={styles.rowTitle}>
        <Link href={appUrl.bill(p.id)} className={styles.rowLink}>
          {readableTitle(p.title)}
        </Link>
      </h3>
      <p className={styles.rowMeta}>
        <span className={styles.stage}>{p.stage === "drafting" ? t.laws.stageDrafting : t.laws.stageSubmitted}</span>
        <span>{typeLabel}</span>
      </p>
      <ArrowRight size={16} className={styles.rowArrow} />
    </article>
  );
}
