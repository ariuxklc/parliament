import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/youth/AdminShell";
import { ListingForm } from "@/components/youth/ListingForm";
import { Panel } from "@/components/youth/Panel";
import { canManage, requireViewer } from "@/lib/youth/auth";
import { getOpportunity, listAccounts, listApplications, slotUsage } from "@/lib/youth/store";
import { removeListing } from "../../actions";
import page from "@/components/ask/askPage.module.css";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";

export const metadata: Metadata = { title: "Зар засах — Залуучуудын дадлага" };
export const dynamic = "force-dynamic";

export default async function EditListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/dadlaga/admin/listings/${id}`);
  const o = getOpportunity(id);
  if (!o || !canManage(viewer, o.ownerId)) notFound();
  const { saved } = await searchParams;
  const owners = viewer.kind === "super" ? listAccounts().filter((a) => a.active || a.id === o.ownerId).map((a) => ({ id: a.id, name: a.displayName })) : null;
  const apps = listApplications().filter((a) => a.opportunityId === o.id).length;

  return (
    <AdminShell viewer={viewer} crumbs={[{ label: o.title }]}>
      <h1 className={page.title}>{o.title}</h1>
      <div className={styles.metaLine}>
        <Link className={styles.metaLink} href={`/dadlaga/${o.id}`}>
          Сурагчид харах байдлаар
        </Link>
        <Link className={styles.metaLink} href={`/dadlaga/admin?s=all&o=${o.id}`}>
          Бүртгэлүүд ({apps})
        </Link>
      </div>
      <div style={{ maxWidth: 860, marginTop: 20 }} className={bill.stack}>
        <Panel title="Зарын мэдээлэл">
          <ListingForm
            key={o.id}
            listing={o}
            booked={Object.fromEntries(slotUsage(o.id))}
            defaultHost={o.host}
            owners={owners}
            savedMessage={saved === "published" ? "Үүсгэж нийтэллээ — сурагчдад харагдаж байна." : saved ? "Ноорог болгож хадгаллаа. Бэлэн бол «Нийтлэх» дарна уу." : undefined}
          />
        </Panel>
        <Panel title="Зар устгах">
          <p className={bill.muted}>Устгавал энэ зарын бүх сурагчийн бүртгэл ({apps}) хамт устна. Ихэнх тохиолдолд «Бүртгэл хаах» хангалттай.</p>
          <form action={removeListing} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={o.id} />
            <button className={bill.btnDanger}>Бүрмөсөн устгах</button>
          </form>
        </Panel>
      </div>
    </AdminShell>
  );
}
