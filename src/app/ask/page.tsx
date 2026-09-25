import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AskParliamentChat } from "@/components/AskParliamentChat";
import { ChevronDown } from "@/components/ui/icons";
import styles from "./page.module.css";
import { getNavigation } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/format";
import { LAWFORUM_SITE, officialUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Ask Parliament AI — УИХ-аас асуух",
  description: "Улсын Их Хурлын албан ёсны мэдээлэлд тулгуурлан асуултад энгийнээр хариулах туршилтын туслах.",
};

/** Minimal: one line of context, the chat, and sources/caveats folded underneath. */
export default async function AskPage() {
  const nav = await getNavigation();
  const now = new Date();
  return (
    <>
      <SiteHeader nav={nav} />
      <main id="main" className={`container ${styles.page}`}>
        <div className={styles.column}>
          <nav className={styles.crumbs} aria-label="Байршил">
            <Link href="/">Нүүр хуудас</Link>
            <span aria-hidden="true">/</span>
            <span>Ask Parliament AI</span>
          </nav>
          <p className={styles.eyebrow}>Ask Parliament AI</p>
          <h1 className={styles.title}>Хууль, УИХ-ын талаар асуугаарай</h1>
          <p className={styles.lede}>Албан ёсны эх сурвалжаас хайж, холбоостой нь энгийнээр хариулна.</p>

          <AskParliamentChat autoFocus />

          <details className={styles.more}>
            <summary>
              <span className={styles.moreTitle}>Эх сурвалж, анхаарах зүйл</span>
              <span className={styles.toggle}>
                <span className={styles.whenClosed}>Дэлгэрэнгүй</span>
                <span className={styles.whenOpen}>Хураах</span>
                <ChevronDown size={15} />
              </span>
            </summary>
            <div className={styles.moreBody}>
              <p className={styles.sources}>
                <a href="https://legalinfo.mn/mn" target="_blank" rel="noopener noreferrer">
                  legalinfo.mn
                </a>
                <a href="https://www.parliament.mn/laws/" target="_blank" rel="noopener noreferrer">
                  УИХ-ын баталсан актууд
                </a>
                <a href={`${LAWFORUM_SITE}/projects`} target="_blank" rel="noopener noreferrer">
                  LawForum
                </a>
                <a href={officialUrl.billBulletin()} target="_blank" rel="noopener noreferrer">
                  Хуулийн төслийн мэдээлэл
                </a>
                <a href={officialUrl.votes()} target="_blank" rel="noopener noreferrer">
                  Санал хураалт
                </a>
                <a href={officialUrl.memberList()} target="_blank" rel="noopener noreferrer">
                  УИХ-ын гишүүд
                </a>
              </p>
              <p className={styles.note}>
                Хариулт бүр албан ёсны эх сурвалжид тулгуурлаж, холбоосыг нь систем өөрөө хавсаргана. Энэ бол туршилтын хувилбар: хууль зүйн зөвлөгөө биш тул
                чухал шийдвэрийн өмнө эх бичвэрийг шалгаарай. Туслах улс төрийн байр суурь санал болгохгүй.
              </p>
            </div>
          </details>
        </div>
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
