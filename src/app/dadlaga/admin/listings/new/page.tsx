import type { Metadata } from "next";
import { AdminShell } from "@/components/youth/AdminShell";
import { ListingForm } from "@/components/youth/ListingForm";
import { Panel } from "@/components/youth/Panel";
import { requireViewer } from "@/lib/youth/auth";
import { listAccounts } from "@/lib/youth/store";
import page from "@/components/ask/askPage.module.css";

export const metadata: Metadata = { title: "Шинэ зар — Залуучуудын дадлага" };
export const dynamic = "force-dynamic";

export default async function NewListing() {
  const viewer = await requireViewer("/dadlaga/admin/listings/new");
  const owners = viewer.kind === "super" ? listAccounts().filter((a) => a.active).map((a) => ({ id: a.id, name: a.displayName })) : null;
  return (
    <AdminShell viewer={viewer} crumbs={[{ label: "Шинэ зар" }]}>
      <h1 className={page.title}>Шинэ зар нэмэх</h1>
      <p className={page.lede}>Ахлах ангийн сурагчдад зориулж бичээрэй: энгийн үгээр, юу хийх, хэзээ, хаана гэдгийг тодорхой.</p>
      <div style={{ maxWidth: 860, marginTop: 20 }}>
        <Panel title="Зарын мэдээлэл">
          <ListingForm listing={null} booked={{}} defaultHost={viewer.kind === "office" ? viewer.account.displayName : ""} owners={owners} />
        </Panel>
      </div>
    </AdminShell>
  );
}
