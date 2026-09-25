import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { YouthShell } from "@/components/youth/YouthShell";
import { Panel } from "@/components/youth/Panel";
import page from "@/components/ask/askPage.module.css";
import styles from "@/components/youth/youth.module.css";
import bill from "@/components/youth/forms.module.css";
import { getOpportunity, isOpen, slotUsage, spotsLeft } from "@/lib/youth/store";
import { currentViewer } from "@/lib/youth/auth";
import { MODES, OPPORTUNITY_TYPES } from "@/lib/youth/types";
import { gradeLabel, slotLabel, todayUB } from "@/lib/youth/format";
import { ApplyForm } from "./ApplyForm";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = getOpportunity((await params).id);
  return { title: o ? `${o.title} — Залуучуудын дадлага` : "Олдсонгүй" };
}

export default async function OpportunityPage({ params }: Props) {
  const o = getOpportunity((await params).id);
  // Drafts are visible only to their office (preview); closed ones stay readable but can't be applied to.
  const viewer = await currentViewer();
  if (!o || (o.status === "draft" && !(viewer && (viewer.kind === "super" || viewer.account.id === o.ownerId)))) notFound();
  const open = isOpen(o);
  const today = todayUB();
  const used = slotUsage(o.id);
  const slots = o.slots
    .filter((s) => s.date >= today)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((s) => ({ id: s.id, label: slotLabel(s), left: spotsLeft(s, used), capacity: s.capacity }));

  return (
    <YouthShell crumbs={[{ href: "/dadlaga", label: "Залуучуудын дадлага" }, { label: o.title }]}>
      <p className={page.eyebrow}>{OPPORTUNITY_TYPES[o.type]}</p>
      <h1 className={page.title}>{o.title}</h1>
      <p className={styles.metaLine}>
        <strong>{o.host}</strong>
        <span>{gradeLabel(o.gradeMin, o.gradeMax)}</span>
        <span>{MODES[o.mode]}</span>
        {o.location ? <span>Байршил: {o.location}</span> : null}
        <span>Бүртгэл {o.deadline.replaceAll("-", ".")} хүртэл</span>
      </p>
      {o.demo || o.status === "draft" ? (
        <p className={styles.notes}>
          {o.demo ? <span className={styles.demo}>Жишээ зар — бодит хөтөлбөр биш</span> : null}
          {o.status === "draft" ? <span className={styles.demo}>Ноорог — зөвхөн танд харагдана</span> : null}
        </p>
      ) : null}

      <div className={styles.detail}>
        <div className={bill.stack}>
          <Panel title="Юу хийх вэ">
            <p style={{ whiteSpace: "pre-line" }}>{o.description}</p>
            {o.tasks.length ? (
              <ul className={styles.tasks} style={{ marginTop: 14 }}>
                {o.tasks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : null}
          </Panel>
          {o.requirements ? (
            <Panel title="Шаардлага">
              <p style={{ whiteSpace: "pre-line" }}>{o.requirements}</p>
            </Panel>
          ) : null}
          <Panel title="Цагийн хуваарь">
            {slots.length ? (
              <ul className={styles.slots}>
                {slots.map((s) => (
                  <li key={s.id} className={styles.slot} style={{ cursor: "default" }} data-full={s.left === 0}>
                    <span className={styles.slotWhen}>
                      <strong>{s.label}</strong>
                      <span className={s.left ? styles.spots : styles.full}>{s.left ? `${s.left}/${s.capacity} суудал үлдсэн` : "Дүүрсэн"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={bill.muted}>Товлосон цаг алга.</p>
            )}
          </Panel>
        </div>

        <Panel title="Бүртгүүлэх" className={`${bill.panel} ${styles.applyPanel}`}>
          {open ? (
            <ApplyForm opportunityId={o.id} slots={slots} gradeMin={o.gradeMin} gradeMax={o.gradeMax} />
          ) : (
            <p className={bill.pending}>{o.status === "draft" ? "Ноорог зар — нийтлэгдээгүй." : "Энэ зарын бүртгэл хаагдсан."}</p>
          )}
        </Panel>
      </div>
    </YouthShell>
  );
}
