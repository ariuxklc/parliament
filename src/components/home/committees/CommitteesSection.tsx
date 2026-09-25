import styles from "./committees.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { Reveal } from "../../motion/Reveal";
import type { Loaded } from "@/lib/types";
import type { CommitteeInfo } from "@/lib/data";
import { ArrowUpRight } from "../../ui/icons";

/** Standing committees (Байнгын хороод): name, chair, size — each links to its official page. */
export function CommitteesSection({ committees }: { committees: Loaded<CommitteeInfo[]> }) {
  if (!committees.ok || !committees.data.length) return null;
  return (
    <section id="horoo" className={styles.section} aria-labelledby="horoo-title">
      <div className="container">
        <SectionHeader id="horoo-title" title="Байнгын хороод" subtitle="Хуулийн төслийг эхлээд байнгын хороо хэлэлцдэг. Хороо бүр нэг салбарыг хариуцна." />
        <Reveal as="ul" className={styles.list}>
          {committees.data.map((c) => (
            <li key={c.id}>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className={styles.item}>
                <span className={styles.name}>{c.name}</span>
                <span className={styles.meta}>
                  {c.chair ? <>Дарга {c.chair}</> : null}
                  {c.chair && c.memberCount ? " · " : null}
                  {c.memberCount ? `${c.memberCount} гишүүн` : null}
                </span>
                <ArrowUpRight size={14} className={styles.arrow} />
                <span className="visually-hidden"> — албан ёсны хуудас (шинэ цонхонд нээгдэнэ)</span>
              </a>
            </li>
          ))}
        </Reveal>
        <p className={styles.source}>Эх сурвалж: new.parliament.mn</p>
      </div>
    </section>
  );
}
