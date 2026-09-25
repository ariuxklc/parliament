import Link from "next/link";
import styles from "./youth.module.css";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import { ArrowRight } from "@/components/ui/icons";
import { isOpen, listOpportunities } from "@/lib/youth/store";
import { OpportunityRow } from "./OpportunityCard";

const STEPS = ["Зар сонгох", "Тохирох цагаа тэмдэглэх", "Эцэг эхийн зөвшөөрөлтэй бүртгүүлэх", "Кодоороо хариугаа шалгах"];

/** Homepage: invite high-school students to the youth opportunities — how it works, and the three closing soonest. */
export function YouthHomeBlock() {
  const open = listOpportunities()
    .filter((o) => isOpen(o))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return (
    <section id="dadlaga" aria-labelledby="dadlaga-title" className={styles.homeBlock}>
      <div className="container">
        <SectionHeader
          id="dadlaga-title"
          title="Залуучуудын дадлага"
          subtitle="Ахлах ангийн сурагч уу? УИХ-ын гишүүний ажлын албанд нэг өдөр ажиллаж, дадлага хийж, судалгаанд оролцоорой."
        />
        <div className={styles.homeGrid}>
          <Reveal className={styles.homeIntro}>
            <ol className={styles.steps} aria-label="Хэрхэн бүртгүүлэх вэ">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <span className={styles.stepN}>{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <div className={styles.homeActions}>
              <Link href="/dadlaga" className={styles.homeAll}>
                {open.length ? `Бүх зар (${open.length})` : "Дэлгэрэнгүй"}
                <ArrowRight size={15} />
              </Link>
              <Link href="/dadlaga/status" className={styles.homeStatus}>
                Бүртгэлээ шалгах
              </Link>
            </div>
          </Reveal>

          <Reveal index={1}>
            {open.length ? (
              <ul className={styles.list} data-compact="true" aria-label="Удахгүй хаагдах зарууд">
                {open.slice(0, 3).map((o) => (
                  <li key={o.id}>
                    <OpportunityRow o={o} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>Одоогоор нээлттэй зар алга — удахгүй нэмэгдэнэ.</p>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
