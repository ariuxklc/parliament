import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AskParliamentChat } from "@/components/AskParliamentChat";
import styles from "@/components/ask/askPage.module.css";
import { getNavigation } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/format";
import { LAWFORUM_SITE, officialUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Ask Parliament AI — УИХ-аас асуух",
  description: "Улсын Их Хурлын албан ёсны мэдээлэлд тулгуурлан асуултад энгийнээр хариулах туршилтын туслах.",
};

export default async function AskPage() {
  const nav = await getNavigation();
  const now = new Date();
  return (
    <>
      <SiteHeader nav={nav} />
      <main id="main" className={`container ${styles.page}`}>
        <nav className={styles.crumbs} aria-label="Байршил">
          <Link href="/">Нүүр хуудас</Link>
          <span aria-hidden="true">/</span>
          <span>Ask Parliament AI</span>
        </nav>
        <p className={styles.eyebrow}>Ask Parliament AI</p>
        <h1 className={styles.title}>УИХ-ын талаар асуугаарай</h1>
        <p className={styles.lede}>
          Хуулийн төсөл, хэлэлцүүлгийн шат, санал хураалт, гишүүд, хуралдааны хуваарийн талаар энгийн хэлээр асуу. Туслах нь албан ёсны эх сурвалжаас хайж, олдсон
          мэдээлэлд л тулгуурлан тайлбарлаж, холбоосыг нь хавсаргана. Баталгаатай мэдээлэл олдохгүй бол таамаглахгүй.
        </p>

        <div className={styles.layout}>
          <AskParliamentChat autoFocus />

          <aside className={styles.aside} aria-label="Мэдээллийн хамрах хүрээ">
            <section className={`${styles.card} ${styles.principle}`}>
              <h2>Үнэний эх сурвалж нь УИХ</h2>
              <p>AI бол мэдээллийн сан биш. Хариулт бүр албан ёсны эх сурвалжаас ирсэн баримт дээр тулгуурлах бөгөөд холбоосыг нь сервер шалгаж хавсаргана.</p>
            </section>
            <section className={styles.card}>
              <h2>Одоогийн хамрах хүрээ</h2>
              <ul>
                <li>
                  <a href={`${LAWFORUM_SITE}/projects`} target="_blank" rel="noopener noreferrer">LawForum</a> — нийтэд нээлттэй хуулийн төслүүд, тэдгээрийн эх бичвэр
                </li>
                <li>
                  <a href={officialUrl.billBulletin()} target="_blank" rel="noopener noreferrer">Хуулийн төслийн мэдээлэл</a> — хэлэлцүүлгийн шат, санаачлагч, байнгын хороо
                </li>
                <li>
                  <a href={officialUrl.votes()} target="_blank" rel="noopener noreferrer">Санал хураалт</a> — нэгдсэн хуралдааны санал хураалтын дүн
                </li>
                <li>
                  <a href={officialUrl.memberList()} target="_blank" rel="noopener noreferrer">УИХ-ын гишүүд</a> — нам, байнгын хороо, тойрог
                </li>
                <li>Хуралдааны баталсан хуваарь, чуулганы мэдээлэл</li>
              </ul>
            </section>
            <section className={styles.card}>
              <h2>Анхаарах зүйл</h2>
              <p>
                Энэ бол туршилтын хувилбар. AI тайлбар нь хууль зүйн зөвлөгөө биш; албан ёсны эх бичвэрийг холбоосоор шалгана уу. Туслах нь улс төрийн байр суурь санал
                болгохгүй, гишүүдийг эрэмбэлэхгүй.
              </p>
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
