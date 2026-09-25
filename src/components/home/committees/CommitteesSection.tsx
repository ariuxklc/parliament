import Image from "next/image";
import styles from "./committees.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { Reveal } from "../../motion/Reveal";
import type { Loaded } from "@/lib/types";
import type { CommitteeInfo } from "@/lib/data";
import { ArrowUpRight } from "../../ui/icons";

/** Standing committees (Байнгын хороод): icon, name, chair, size — each links to its official page. */
export function CommitteesSection({ committees }: { committees: Loaded<CommitteeInfo[]> }) {
  if (!committees.ok || !committees.data.length) return null;
  return (
    <section id="horoo" className={styles.section} aria-labelledby="horoo-title">
      <div className="container">
        <SectionHeader id="horoo-title" title="Байнгын хороод" subtitle="Хуулийн төслийг эхлээд байнгын хороо хэлэлцдэг. Хороо бүр тодорхой салбарыг хариуцна." />
        <ul className={styles.grid}>
          {committees.data.map((c, i) => (
            <Reveal as="li" key={c.id} index={i % 4}>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className={styles.tile}>
                <span className={styles.icon} aria-hidden="true">
                  {c.icon ? <Image src={c.icon} alt="" width={40} height={40} /> : null}
                </span>
                <span className={styles.name}>{c.name}</span>
                <span className={styles.meta}>
                  {c.chair ? <>Дарга: {c.chair}</> : null}
                  {c.chair && c.memberCount ? " · " : null}
                  {c.memberCount ? `${c.memberCount} гишүүн` : null}
                </span>
                <ArrowUpRight size={14} className={styles.arrow} />
                <span className="visually-hidden"> — албан ёсны хуудас (шинэ цонхонд нээгдэнэ)</span>
              </a>
            </Reveal>
          ))}
        </ul>
        <p className={styles.source}>Эх сурвалж: new.parliament.mn — Байнгын хороод, гишүүдийн бүрэлдэхүүн</p>
      </div>
    </section>
  );
}
