import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AskParliamentChat } from "@/components/AskParliamentChat";
import { ArrowUpRight } from "@/components/ui/icons";
import styles from "@/components/ask/askPage.module.css";
import { getNavigation } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/format";
import { LAWFORUM_SITE } from "@/lib/site";
import { parliamentData } from "@/lib/parliament/data";
import { linkBulletin } from "@/lib/ai/retrieve";
import { stageListing } from "@/lib/ai/evidence";
import { BillStory } from "@/components/bill/BillStory";

type Params = Promise<{ billId: string }>;

async function findBill(billId: string) {
  if (!/^[1-9]\d{0,6}$/.test(billId)) return null;
  const bills = await parliamentData.bills();
  return bills.find((b) => b.id === Number(billId)) ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const bill = await findBill((await params).billId).catch(() => null);
  return { title: bill ? `${bill.title} — Ask Parliament AI` : "Хуулийн төсөл — Ask Parliament AI" };
}

/** Any publicly listed LawForum project, with Ask Parliament AI using it as context. */
export default async function BillPage({ params }: { params: Params }) {
  const { billId } = await params;
  const bill = await findBill(billId);
  if (!bill) notFound();

  const [nav, rows, doc] = await Promise.all([
    getNavigation(),
    parliamentData.bulletin().catch(() => []),
    parliamentData.billDocument(bill).catch(() => null),
  ]);
  const row = linkBulletin(bill, rows);
  const headings = doc?.clauses.filter((c) => c.isHeading) ?? [];
  const files = doc ? [...new Map(doc.files.map((f) => [f.label, f])).values()] : [];
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
        <h1 className={styles.title}>{bill.title}</h1>
        <div className={styles.meta}>
          <span className={`${styles.chip} ${styles.chipStage}`}>{bill.stage === "submitted" ? "Өргөн мэдүүлсэн" : "Санал авч буй"}</span>
          {bill.categoryTitle ? <span className={styles.chip}>{bill.categoryTitle}</span> : null}
          <span className={styles.chip}>LawForum-д нийтэлсэн {formatDate(bill.publishedDate)}</span>
        </div>
        <a className={styles.officialLink} href={bill.url} target="_blank" rel="noopener noreferrer">
          Албан ёсны эх бичвэрийг LawForum-д үзэх <ArrowUpRight size={15} />
          <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
        </a>

        <BillStory bill={bill} row={row} />

        <div className={styles.layout}>
          <AskParliamentChat context={{ entity: { type: "bill", id: String(bill.id) }, title: bill.title, kindLabel: "Одоо үзэж буй төсөл" }} />

          <aside className={styles.aside} aria-label="Төслийн албан ёсны мэдээлэл">
            <section className={styles.card}>
              <h2>Албан ёсны бүртгэл</h2>
              <p>{stageListing(bill.stage)}.</p>
              <p style={{ marginTop: 8, color: "var(--ink-500)", fontSize: 13 }}>
                LawForum-д нийтэлсэн огноо нь албан ёсоор өргөн мэдүүлсэн огноо биш байж болно.
              </p>
            </section>
            {row ? (
              <section className={styles.card}>
                <h2>Хэлэлцүүлгийн шат ({formatDate(row.snapshotDate)}-ны байдлаар)</h2>
                <p>
                  Санаачлагч: {row.initiator ?? "—"}
                  <br />
                  Өргөн мэдүүлсэн: {row.submittedDate ? formatDate(row.submittedDate) : "—"}
                  <br />
                  {row.committee ?? ""}
                </p>
                {row.stages.length ? (
                  <ul className={styles.stages} style={{ marginTop: 10 }}>
                    {row.stages.map((s, i) => (
                      <li key={i}>
                        {s.label}
                        {s.committeeNote || s.plenaryNote ? (
                          <small>
                            {[s.committeeNote && `БХ: ${s.committeeNote}`, s.plenaryNote && `НХ: ${s.plenaryNote}`].filter(Boolean).join(" · ")}
                          </small>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p style={{ marginTop: 10 }}>
                  <a href={row.url} target="_blank" rel="noopener noreferrer">
                    УИХ-ын хуулийн төслийн мэдээлэл
                  </a>
                </p>
              </section>
            ) : null}
            {headings.length ? (
              <section className={styles.card}>
                <h2>Төслийн бүтэц</h2>
                <ul className={styles.outline}>
                  {headings.map((h) => (
                    <li key={h.anchor}>
                      <a href={`${bill.url}#${h.anchor}`} target="_blank" rel="noopener noreferrer">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {files.length ? (
              <section className={styles.card}>
                <h2>Төслийн албан ёсны файлууд</h2>
                <ul>
                  {files.map((f) => (
                    <li key={f.path}>
                      <a href={`${LAWFORUM_SITE}${f.path}`} target="_blank" rel="noopener noreferrer">
                        {f.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
