import Link from "next/link";
import styles from "./legislation.module.css";
import type { Proposal } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { appUrl } from "@/lib/site";
import { TYPE_SHORT_LABEL } from "@/lib/normalize/proposals";
import { ArrowRight, ArrowUpRight } from "../../ui/icons";

interface BillCardProps {
  proposal: Proposal;
  index: number;
  showUpdated?: boolean;
}

/**
 * One legislative proposal. The card opens our bill page (/laws/{id}: official record, journey,
 * Ask Parliament AI); a secondary link goes straight to the official LawForum record.
 */
export function BillCard({ proposal: p, index, showUpdated }: BillCardProps) {
  const typeLabel = TYPE_SHORT_LABEL[p.typeId] ?? p.typeTitle;
  return (
    <article className={styles.card} data-stage={p.stage} style={{ ["--i" as string]: index }}>
      <div className={styles.cardTop}>
        <span className={styles.typeChip}>{typeLabel}</span>
        {p.categoryTitle ? <span className={styles.category}>{p.categoryTitle}</span> : null}
      </div>
      <h3 className={styles.cardTitle}>
        <Link href={appUrl.bill(p.id)} className={styles.cardLink}>
          {p.title}
          <span className="visually-hidden"> — {t.laws.openBill}</span>
        </Link>
      </h3>
      {/* TODO(ai-summaries): render p.summary here once human-reviewed plain-language summaries exist. */}
      <div className={styles.cardBottom}>
        <span className={styles.stage}>
          <span className={styles.stageDot} aria-hidden="true" />
          {p.stage === "drafting" ? t.laws.stageDraftingLong : t.laws.stageSubmittedLong}
        </span>
        <span className={styles.cardDates}>
          <time dateTime={p.publishedDate}>{formatDate(p.publishedDate)}</time>
          {showUpdated && p.updatedAt ? (
            <span className={styles.updated}>
              {" · "}шинэчилсэн <time dateTime={p.updatedAt}>{formatDate(p.updatedAt)}</time>
            </span>
          ) : null}
        </span>
        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.sourceMini}>
          {t.laws.lawforumShort}
          <ArrowUpRight size={12} />
          <span className="visually-hidden"> — {t.laws.openOnLawforum} {t.common.opensInNewTab}</span>
        </a>
        <span className={styles.cardArrow} aria-hidden="true">
          <ArrowRight size={16} />
        </span>
      </div>
    </article>
  );
}
