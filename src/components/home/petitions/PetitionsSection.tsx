import styles from "./petitions.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { Reveal } from "../../motion/Reveal";
import type { Loaded } from "@/lib/types";
import type { PetitionItem } from "@/lib/normalize/petitions";
import { formatDate, formatNumber } from "@/lib/format";
import { officialUrl } from "@/lib/site";
import { ArrowUpRight } from "../../ui/icons";

/** Public petitions — the four most-supported, each linking to its official page. Hidden if the feed fails. */
export function PetitionsSection({ petitions }: { petitions: Loaded<PetitionItem[]> }) {
  if (!petitions.ok || !petitions.data.length) return null;
  return (
    <section id="orgodol" className={styles.section} aria-labelledby="orgodol-title">
      <div className="container">
        <SectionHeader
          id="orgodol-title"
          title="Нийтийн өргөдөл"
          subtitle="Иргэд Улсын Их Хуралд өргөдөл гаргаж, дэмжлэг цуглуулдаг. Хамгийн их дэмжигдэж буй өргөдлүүд:"
          action={<OfficialSourceLink href={officialUrl.petitions()}>Өргөдөл гаргах, дэмжих</OfficialSourceLink>}
        />
        <ol className={styles.list}>
          {petitions.data.map((p, i) => {
            const pct = Math.min(100, (p.signatures / p.goal) * 100);
            return (
              <Reveal as="li" key={p.number} index={i}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.item}>
                  <span className={styles.top}>
                    {p.kind ? <span className={styles.kind}>{p.kind}</span> : null}
                    {p.date ? <span className={styles.date}>{formatDate(p.date)}</span> : null}
                  </span>
                  <span className={styles.title}>{p.title}</span>
                  <span className={styles.progress} aria-hidden="true">
                    <span style={{ width: `${Math.max(pct, 0.8)}%` }} />
                  </span>
                  <span className={styles.count}>
                    <strong className="tabular">{formatNumber(p.signatures)}</strong> / {formatNumber(p.goal)} гарын үсэг
                    <ArrowUpRight size={13} />
                  </span>
                  <span className="visually-hidden"> — petition.parliament.mn (шинэ цонхонд нээгдэнэ)</span>
                </a>
              </Reveal>
            );
          })}
        </ol>
        <p className={styles.source}>Эх сурвалж: petition.parliament.mn — Нийтийн өргөдлийн систем</p>
      </div>
    </section>
  );
}
