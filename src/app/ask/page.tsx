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
        <h1 className={styles.title}>Хууль, УИХ-ын талаар асуугаарай</h1>
        <p className={styles.lede}>
          Хууль танд хэрхэн хамаарах, төстэй ямар хууль байгаа, хууль он жилүүдээр хэрхэн өөрчлөгдсөн, тодорхой өдөр УИХ юу хэлэлцэж баталсныг энгийн хэлээр асуу.
          Туслах нь хүчин төгөлдөр хууль, хуулийн төсөл, хуралдаан, санал хураалтын албан ёсны мэдээллээс өөрөө хайж, холбоосыг нь хавсаргана.
        </p>

        <div className={styles.layout}>
          <AskParliamentChat autoFocus />

          <aside className={styles.aside} aria-label="Мэдээллийн хамрах хүрээ">
            <section className={`${styles.card} ${styles.principle}`}>
              <h2>Үнэний эх сурвалж нь УИХ</h2>
              <p>AI бол мэдээллийн сан биш. Туслах нь хариулт бүрийг албан ёсны эх сурвалжаас хайж олсон баримтад тулгуурлаж, холбоосыг нь хавсаргана — холбоосыг AI биш, систем өөрөө үүсгэдэг.</p>
            </section>
            <section className={styles.card}>
              <h2>Одоогийн хамрах хүрээ</h2>
              <ul>
                <li>
                  <a href="https://legalinfo.mn/mn" target="_blank" rel="noopener noreferrer">legalinfo.mn</a> — хүчин төгөлдөр хууль, тогтоол, тэдгээрийн өөрчлөлтийн түүх
                </li>
                <li>
                  <a href="https://www.parliament.mn/laws/" target="_blank" rel="noopener noreferrer">УИХ-ын баталсан актууд</a> — 7,000+ хууль, тогтоол, батлагдсан огноотой
                </li>
                <li>
                  <a href={`${LAWFORUM_SITE}/projects`} target="_blank" rel="noopener noreferrer">LawForum</a> — хуулийн төслүүд, тэдгээрийн эх бичвэр
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
                <li>Нэгдсэн хуралдаан, хэлэлцсэн асуудал, хуралдааны тэмдэглэл, хуваарь, мэдээ</li>
              </ul>
            </section>
            <section className={styles.card}>
              <h2>Анхаарах зүйл</h2>
              <p>
                Энэ бол туршилтын хувилбар. Туслах нь хуулийн мэдээлэл өгөх боловч хууль зүйн зөвлөгөө биш — чухал шийдвэр гаргахаасаа өмнө эх бичвэрийг шалгаж, шаардлагатай
                бол хуульчид хандаарай. Туслах нь улс төрийн байр суурь санал болгохгүй, дотоод системийн мэдээлэл задруулахгүй.
              </p>
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
