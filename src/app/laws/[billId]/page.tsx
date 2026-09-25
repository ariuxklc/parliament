import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AskParliamentChat } from "@/components/AskParliamentChat";
import { ArrowUpRight, ChevronDown } from "@/components/ui/icons";
import styles from "@/components/ask/askPage.module.css";
import { getNavigation } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/format";
import { LAWFORUM_SITE } from "@/lib/site";
import { parliamentData } from "@/lib/parliament/data";
import { linkBulletin, stageListing } from "@/lib/parliament/bills";
import { BillSide, BillStory } from "@/components/bill/BillStory";
import { readableTitle } from "@/lib/text/readable";
import { getProjectIdByLawforumId } from "@/lib/project-summaries/read";

type Params = Promise<{ billId: string }>;

async function findBill(billId: string) {
  if (!/^[1-9]\d{0,6}$/.test(billId)) return null;
  const bills = await parliamentData.bills();
  return bills.find((b) => b.id === Number(billId)) ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const bill = await findBill((await params).billId).catch(() => null);
  return { title: bill ? `${readableTitle(bill.title)} — Ask Parliament AI` : "Хуулийн төсөл — Ask Parliament AI" };
}

/** "3 бүлэг, 27 зүйл" for the collapsed outline. */
function outlineCount(headings: { text: string }[]): string {
  const chapters = headings.filter((h) => /^\S+\s+бүлэг/i.test(h.text.trim())).length;
  const articles = headings.filter((h) => /^\d+(\s+\S+)?\s+зүйл/i.test(h.text.trim())).length;
  return [chapters ? `${chapters} бүлэг` : "", articles ? `${articles} зүйл` : ""].filter(Boolean).join(", ") || `${headings.length} хэсэг`;
}

function FoldSummary({ title, count }: { title: string; count: string }) {
  return (
    <summary>
      <span className={styles.foldTitle}>
        {title}
        {" "}
        <span className={styles.foldCount}>·&nbsp;{count}</span>
      </span>
      <span className={styles.foldToggle}>
        <span className={styles.whenClosed}>Дэлгэрэнгүй</span>
        <span className={styles.whenOpen}>Хураах</span>
        <ChevronDown size={15} />
      </span>
    </summary>
  );
}

/** Any publicly listed LawForum project, with Ask Parliament AI using it as context. */
export default async function BillPage({ params }: { params: Params }) {
  const { billId } = await params;
  const bill = await findBill(billId);
  if (!bill) notFound();

  const [nav, rows, doc, projectId] = await Promise.all([
    getNavigation(),
    parliamentData.bulletin().catch(() => []),
    parliamentData.billDocument(bill).catch(() => null),
    getProjectIdByLawforumId(bill.id).catch(() => null),
  ]);
  const row = linkBulletin(bill, rows);
  const headings = doc?.clauses.filter((c) => c.isHeading) ?? [];
  const files = doc ? [...new Map(doc.files.map((f) => [f.label, f])).values()] : [];
  const title = readableTitle(bill.title);
  const now = new Date();

  return (
    <>
      <SiteHeader nav={nav} />
      <main id="main" className={`container ${styles.page}`}>
        <nav className={styles.crumbs} aria-label="Байршил">
          <Link href="/">Нүүр хуудас</Link>
          <span aria-hidden="true">/</span>
          <Link href="/ask">Ask Parliament AI</Link>
          <span aria-hidden="true">/</span>
          <span>Хуулийн төсөл</span>
        </nav>
        <p className={styles.eyebrow}>{bill.typeTitle}</p>
        <h1 className={styles.title}>{title}</h1>
        {/* Quiet meta lines: what the old chips, registry card and discussion card said, without repeating the journey. */}
        <div className={styles.metaBlock}>
          <p className={styles.metaLine}>
            <span className={styles.stage} data-stage={bill.stage} title={`${stageListing(bill.stage)}.`}>
              <span className={styles.dot} aria-hidden="true" />
              {bill.stage === "submitted" ? "Өргөн мэдүүлсэн" : "Санал авч буй"}
            </span>
            {bill.categoryTitle ? <span>{bill.categoryTitle}</span> : null}
            <span title="LawForum-д нийтэлсэн огноо нь албан ёсоор өргөн мэдүүлсэн огноо биш байж болно.">
              LawForum-д нийтэлсэн {formatDate(bill.publishedDate)}
            </span>
            <span>
              <a href={bill.url} target="_blank" rel="noopener noreferrer">
                Эх бичвэр <ArrowUpRight size={13} />
                <span className="visually-hidden"> (LawForum, шинэ цонхонд нээгдэнэ)</span>
              </a>
            </span>
            {row ? (
              <span>
                <a href={row.url} target="_blank" rel="noopener noreferrer">
                  УИХ-ын мэдээлэл <ArrowUpRight size={13} />
                  <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
                </a>
              </span>
            ) : null}
          </p>
          {row?.initiator || row?.committee ? (
            <p className={`${styles.metaLine} ${styles.metaSub}`}>
              {row.initiator ? <span>Санаачлагч: {row.initiator}</span> : null}
              {row.committee ? <span>{row.committee}</span> : null}
            </p>
          ) : null}
        </div>

        <BillStory bill={bill} row={row} />

        <div className={styles.layout}>
          <AskParliamentChat context={{ entity: { type: "bill", id: String(bill.id) }, title, kindLabel: "Одоо үзэж буй төсөл" }} />

          <aside className={styles.aside} aria-label="Төслийн албан ёсны мэдээлэл">
            <BillSide bill={bill} />
            {headings.length ? (
              <details className={`${styles.card} ${styles.fold}`}>
                <FoldSummary title="Төслийн бүтэц" count={outlineCount(headings)} />
                <ul className={styles.outline}>
                  {headings.map((h) => (
                    <li key={h.anchor}>
                      <a href={`${bill.url}#${h.anchor}`} target="_blank" rel="noopener noreferrer">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {projectId ? (
              <Link className={`${styles.card} ${styles.linkRow}`} href={`/projects/${projectId}`}>
                <span className={styles.foldTitle}>Төслийн албан ёсны файлууд</span>
                <span className={styles.foldToggle}>Шат бүрээр →</span>
              </Link>
            ) : files.length ? (
              <details className={`${styles.card} ${styles.fold}`}>
                <FoldSummary title="Төслийн албан ёсны файлууд" count={`${files.length} файл`} />
                <ul>
                  {files.map((f) => (
                    <li key={f.path}>
                      <a href={`${LAWFORUM_SITE}${f.path}`} target="_blank" rel="noopener noreferrer">
                        {f.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </aside>
        </div>
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
