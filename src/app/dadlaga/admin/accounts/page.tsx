import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/youth/AdminShell";
import { Panel } from "@/components/youth/Panel";
import { requireViewer } from "@/lib/youth/auth";
import { listAccounts, listOpportunities } from "@/lib/youth/store";
import { setAccountActive } from "../actions";
import page from "@/components/ask/askPage.module.css";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";
import { CreateAccount, ResetPassword } from "./AccountForms";

export const metadata: Metadata = { title: "Ажлын албад — Залуучуудын дадлага" };
export const dynamic = "force-dynamic";

export default async function Accounts() {
  const viewer = await requireViewer("/dadlaga/admin/accounts");
  if (viewer.kind !== "super") notFound();
  const accounts = listAccounts().sort((a, b) => a.displayName.localeCompare(b.displayName, "mn"));
  const listings = listOpportunities();

  return (
    <AdminShell viewer={viewer} crumbs={[{ label: "Ажлын албад" }]}>
      <h1 className={page.title}>Ажлын албадын нэвтрэх эрх</h1>
      <p className={page.lede}>Гишүүний ажлын алба бүр өөрийн зараа л харж, засна. Түр нууц үгийг албанд биечлэн эсвэл утсаар дамжуулна.</p>
      <div className={bill.stack} style={{ marginTop: 20 }}>
        <Panel title="Шинэ эрх">
          <CreateAccount />
        </Panel>
        <Panel title={`Бүртгэлтэй албад (${accounts.length})`}>
          {accounts.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Алба</th>
                    <th>Нэвтрэх нэр</th>
                    <th>Зар</th>
                    <th>Төлөв</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.displayName}</td>
                      <td>
                        <code>{a.username}</code>
                      </td>
                      <td>{listings.filter((o) => o.ownerId === a.id).length}</td>
                      <td>
                        <span className={styles.statusTag} data-s={a.active ? "accepted" : "withdrawn"}>
                          {a.active ? "Идэвхтэй" : "Хаасан"}
                        </span>
                      </td>
                      <td style={{ display: "grid", gap: 6 }}>
                        <form action={setAccountActive}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="active" value={a.active ? "0" : "1"} />
                          <button className={a.active ? bill.btnDanger : bill.btn}>{a.active ? "Эрх хаах" : "Сэргээх"}</button>
                        </form>
                        {a.active ? <ResetPassword id={a.id} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={bill.muted}>Одоогоор эрх үүсгээгүй байна.</p>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}
