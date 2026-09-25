import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/youth/AdminShell";
import { Panel } from "@/components/youth/Panel";
import { canManage, requireViewer } from "@/lib/youth/auth";
import { getApplication, getOpportunity, slotUsage, spotsLeft } from "@/lib/youth/store";
import { APPLICATION_STATUSES } from "@/lib/youth/types";
import { slotLabel } from "@/lib/youth/format";
import page from "@/components/ask/askPage.module.css";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";
import { Decision } from "./Decision";

export const metadata: Metadata = { title: "Бүртгэл — Залуучуудын дадлага", robots: { index: false } };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" });

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/dadlaga/admin/applications/${id}`);
  const a = getApplication(id);
  const o = a && getOpportunity(a.opportunityId);
  if (!a || !o || !canManage(viewer, o.ownerId)) notFound();
  const used = slotUsage(o.id);
  const slots = o.slots
    .filter((s) => a.slotIds.includes(s.id))
    .map((s) => ({ id: s.id, label: slotLabel(s), left: spotsLeft(s, used), capacity: s.capacity, mine: a.status === "accepted" && a.confirmedSlotId === s.id }));

  return (
    <AdminShell viewer={viewer} crumbs={[{ href: `/dadlaga/admin?s=all&o=${o.id}`, label: o.title }, { label: a.student.name }]}>
      <p className={page.eyebrow}>{o.title}</p>
      <h1 className={page.title}>{a.student.name}</h1>
      <div className={styles.metaLine}>
        <span className={styles.statusTag} data-s={a.status}>
          {APPLICATION_STATUSES[a.status]}
        </span>
        <span>Код: {a.code}</span>
        <span>Илгээсэн: {when(a.createdAt)}</span>
      </div>

      <div className={styles.detail}>
        <div className={bill.stack}>
          <Panel title="Сурагч">
            <dl className={styles.dl}>
              <dt>Сургууль</dt>
              <dd>{a.student.school}</dd>
              <dt>Анги</dt>
              <dd>{a.student.grade}-р анги</dd>
              <dt>Утас</dt>
              <dd>
                <a href={`tel:${a.student.phone}`}>{a.student.phone}</a>
              </dd>
              <dt>И-мэйл</dt>
              <dd>{a.student.email ?? "—"}</dd>
            </dl>
          </Panel>
          <Panel title="Эцэг эх / асран хамгаалагч">
            <dl className={styles.dl}>
              <dt>Нэр</dt>
              <dd>{a.parent.name}</dd>
              <dt>Утас</dt>
              <dd>
                <a href={`tel:${a.parent.phone}`}>{a.parent.phone}</a>
              </dd>
              <dt>Зөвшөөрөл</dt>
              <dd>Сурагч тэмдэглэсэн{a.parentCalled ? " · ✓ ажлын алба утсаар баталгаажуулсан" : " · утсаар баталгаажуулаагүй"}</dd>
            </dl>
          </Panel>
          <Panel title="Яагаад оролцохыг хүсэж байна">
            <p style={{ whiteSpace: "pre-line" }}>{a.motivation}</p>
          </Panel>
        </div>
        <Panel title="Шийдвэр">
          <Decision
            key={a.id}
            id={a.id}
            status={a.status}
            slots={slots}
            parentCalled={a.parentCalled}
            officeNote={a.officeNote ?? ""}
            parentPhone={a.parent.phone}
          />
          <p className={bill.muted} style={{ marginTop: 14, fontSize: 13 }}>
            Шийдвэр, зурвас нь сурагчийн &quot;Төлөв шалгах&quot; хуудсанд шууд харагдана. <Link href={`/dadlaga/${o.id}`}>Зарыг харах ↗</Link>
          </p>
        </Panel>
      </div>
    </AdminShell>
  );
}
