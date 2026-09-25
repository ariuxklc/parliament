import Link from "next/link";
import type { Opportunity } from "@/lib/youth/types";
import { MODES, OPPORTUNITY_TYPES } from "@/lib/youth/types";
import { slotUsage, spotsLeft } from "@/lib/youth/store";
import { dayLabel, gradeLabel, todayUB } from "@/lib/youth/format";
import { ArrowRight } from "@/components/ui/icons";
import styles from "./youth.module.css";

/** One listing as a quiet row: what kind, the title, who hosts it, then one line of facts. */
export function OpportunityRow({ o }: { o: Opportunity }) {
  const today = todayUB();
  const used = slotUsage(o.id);
  const upcoming = o.slots.filter((s) => s.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const spots = upcoming.reduce((n, s) => n + spotsLeft(s, used), 0);
  return (
    <Link href={`/dadlaga/${o.id}`} className={styles.row}>
      <span className={styles.rowType}>
        {OPPORTUNITY_TYPES[o.type]}
        {o.demo ? <span className={styles.demo}>Жишээ зар</span> : null}
      </span>
      <span className={styles.rowTitle}>{o.title}</span>
      <span className={styles.rowHost}>{o.host}</span>
      <span className={styles.rowSummary}>{o.summary}</span>
      <span className={styles.facts}>
        <span>{gradeLabel(o.gradeMin, o.gradeMax)}</span>
        <span>{MODES[o.mode]}</span>
        {upcoming[0] ? <span>Эхлэх {dayLabel(upcoming[0].date)}</span> : null}
        <span className={spots ? styles.spots : styles.full}>{spots ? `${spots} суудал` : "Суудал дүүрсэн"}</span>
        <span>Бүртгэл {o.deadline.slice(5).replace("-", ".")} хүртэл</span>
      </span>
      <ArrowRight size={16} className={styles.rowArrow} />
    </Link>
  );
}
