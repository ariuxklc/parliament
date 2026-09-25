import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/youth/AdminShell";
import { Panel } from "@/components/youth/Panel";
import { requireViewer, canManage } from "@/lib/youth/auth";
import { isOpen, listAccounts, listApplications, listOpportunities, slotUsage } from "@/lib/youth/store";
import { APPLICATION_STATUSES, OPPORTUNITY_TYPES, type ApplicationStatus } from "@/lib/youth/types";
import { todayUB } from "@/lib/youth/format";
import page from "@/components/ask/askPage.module.css";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";

export const metadata: Metadata = { title: "Удирдлага — Залуучуудын дадлага" };
export const dynamic = "force-dynamic";

const LISTING_STATUS = { draft: "Ноорог", published: "Нийтэлсэн", closed: "Хаасан" } as const;

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ s?: string; o?: string }> }) {
  const viewer = await requireViewer("/dadlaga/admin");
  const { s = "active", o: onlyListing = "" } = await searchParams;
  const listings = listOpportunities()
    .filter((o) => canManage(viewer, o.ownerId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const byId = new Map(listings.map((o) => [o.id, o]));
  const apps = listApplications()
    .filter((a) => byId.has(a.opportunityId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const owners = new Map(listAccounts().map((a) => [a.id, a.displayName]));
  const today = todayUB();

  const count = (st: ApplicationStatus) => apps.filter((a) => a.status === st).length;
  const shown = apps.filter(
    (a) =>
      (!onlyListing || a.opportunityId === onlyListing) &&
      (s === "all" ? true : s === "active" ? a.status === "submitted" || a.status === "reviewing" : a.status === s),
  );
  const filterHref = (next: { s?: string; o?: string }) => {
    const q = new URLSearchParams({ s: next.s ?? s, ...(next.o ?? onlyListing ? { o: next.o ?? onlyListing } : {}) });
    return `/dadlaga/admin?${q}`;
  };
  const FILTERS: [string, string][] = [
    ["active", `Шийдвэрлэх (${count("submitted") + count("reviewing")})`],
    ["accepted", `Баталгаажсан (${count("accepted")})`],
    ["waitlist", `Хүлээлэг (${count("waitlist")})`],
    ["rejected", `Татгалзсан (${count("rejected")})`],
    ["withdrawn", `Цуцалсан (${count("withdrawn")})`],
    ["all", `Бүгд (${apps.length})`],
  ];

  return (
    <AdminShell viewer={viewer} crumbs={[]}>
      <h1 className={page.title}>Дадлагын зар, бүртгэл</h1>

      <div className={styles.stats} style={{ margin: "20px 0 28px" }}>
        <div className={styles.stat}>
          <strong>{listings.filter((o) => isOpen(o)).length}</strong>
          <span>Бүртгэл нээлттэй зар</span>
        </div>
        <div className={styles.stat}>
          <strong>{count("submitted")}</strong>
          <span>Шинэ бүртгэл</span>
        </div>
        <div className={styles.stat}>
          <strong>{apps.filter((a) => (a.status === "submitted" || a.status === "reviewing") && !a.parentCalled).length}</strong>
          <span>Эцэг эх рүү залгаагүй</span>
        </div>
        <div className={styles.stat}>
          <strong>{count("accepted")}</strong>
          <span>Баталгаажсан сурагч</span>
        </div>
      </div>

      <div className={bill.stack}>
        <Panel title={viewer.kind === "super" ? "Бүх зар" : "Манай зарууд"}>
          {listings.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Зар</th>
                    <th>Төлөв</th>
                    <th>Суудал</th>
                    <th>Шинэ</th>
                    <th>Хаагдах</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((o) => {
                    const used = slotUsage(o.id);
                    const seats = o.slots.filter((x) => x.date >= today).reduce((n, x) => n + x.capacity, 0);
                    const filled = o.slots.filter((x) => x.date >= today).reduce((n, x) => n + (used.get(x.id) ?? 0), 0);
                    const fresh = apps.filter((a) => a.opportunityId === o.id && a.status === "submitted").length;
                    return (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/dadlaga/admin/listings/${o.id}`}>{o.title}</Link>
                          <div className={bill.muted} style={{ fontSize: 13 }}>
                            {OPPORTUNITY_TYPES[o.type]}
                            {viewer.kind === "super" ? ` · ${owners.get(o.ownerId) ?? "Тамгын газар"}` : ""}
                            {o.demo ? " · жишээ" : ""}
                          </div>
                        </td>
                        <td>
                          <span className={styles.statusTag} data-s={o.status === "published" ? (isOpen(o) ? "accepted" : "waitlist") : o.status === "draft" ? "submitted" : "rejected"}>
                            {o.status === "published" && !isOpen(o) ? "Хугацаа дууссан" : LISTING_STATUS[o.status]}
                          </span>
                        </td>
                        <td>
                          {filled}/{seats}
                        </td>
                        <td>{fresh ? <Link href={filterHref({ s: "active", o: o.id })}>{fresh}</Link> : "—"}</td>
                        <td>{o.deadline.replaceAll("-", ".")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={bill.muted}>
              Одоогоор зар алга. <Link href="/dadlaga/admin/listings/new">Эхний зараа нэмэх →</Link>
            </p>
          )}
        </Panel>

        <Panel title="Сурагчдын бүртгэл">
          <div className={styles.filterRow} style={{ marginBottom: 12 }}>
            {FILTERS.map(([key, label]) => (
              <Link key={key} href={filterHref({ s: key })} className={styles.chip} aria-current={s === key}>
                {label}
              </Link>
            ))}
            {onlyListing && byId.has(onlyListing) ? (
              <Link href={`/dadlaga/admin?s=${s}`} className={styles.chip} aria-current>
                {byId.get(onlyListing)!.title} ✕
              </Link>
            ) : null}
          </div>
          {shown.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Сурагч</th>
                    <th>Зар</th>
                    <th>Эцэг эх</th>
                    <th>Төлөв</th>
                    <th>Огноо</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/dadlaga/admin/applications/${a.id}`}>{a.student.name}</Link>
                        <div className={bill.muted} style={{ fontSize: 13 }}>
                          {a.student.school} · {a.student.grade}-р анги
                        </div>
                      </td>
                      <td>{byId.get(a.opportunityId)?.title}</td>
                      <td>{a.parentCalled ? "✓ Залгасан" : <span className={bill.muted}>Залгаагүй</span>}</td>
                      <td>
                        <span className={styles.statusTag} data-s={a.status}>
                          {APPLICATION_STATUSES[a.status]}
                        </span>
                      </td>
                      <td>{new Date(a.createdAt).toLocaleDateString("mn-MN", { timeZone: "Asia/Ulaanbaatar" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={bill.muted}>Энэ шүүлтүүрт бүртгэл алга.</p>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}
