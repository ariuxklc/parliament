import type { ReactNode } from "react";
import Link from "next/link";
import { YouthShell } from "./YouthShell";
import { officeLogout, staffLogout } from "@/app/dadlaga/admin/actions";
import type { Viewer } from "@/lib/youth/auth";
import bill from "@/components/youth/forms.module.css";
import styles from "./youth.module.css";

/** Admin pages: breadcrumbs + a bar with who is signed in, the admin menu and sign-out. */
export function AdminShell({ viewer, crumbs, children }: { viewer: Viewer; crumbs: { href?: string; label: string }[]; children: ReactNode }) {
  const who = viewer.kind === "super" ? viewer.name : viewer.account.displayName;
  return (
    <YouthShell crumbs={[{ href: "/dadlaga", label: "Залуучуудын дадлага" }, { href: "/dadlaga/admin", label: "Удирдлага" }, ...crumbs]}>
      <div className={styles.adminBar}>
        <span>
          <span className={bill.muted}>Нэвтэрсэн:</span> <strong>{who}</strong>
          {viewer.kind === "super" ? <span className={styles.demo} style={{ marginLeft: 8 }}>Тамгын газар — бүх зар</span> : null}
        </span>
        <nav>
          <Link href="/dadlaga/admin">Самбар</Link>
          <Link href="/dadlaga/admin/listings/new">+ Шинэ зар</Link>
          {viewer.kind === "super" ? <Link href="/dadlaga/admin/accounts">Ажлын албад</Link> : null}
          <form action={viewer.kind === "super" ? staffLogout : officeLogout}>
            <button className={bill.btnGhost}>Гарах</button>
          </form>
        </nav>
      </div>
      {children}
    </YouthShell>
  );
}
