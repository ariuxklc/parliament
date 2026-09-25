"use client";

import { useActionState } from "react";
import { updateApplication, type FormState } from "../../actions";
import { submitKeepingValues } from "@/components/youth/submit";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";

type SlotChoice = { id: string; label: string; left: number; capacity: number; mine: boolean };

export function Decision({
  id,
  status,
  slots,
  parentCalled,
  officeNote,
  parentPhone,
}: {
  id: string;
  status: string;
  slots: SlotChoice[];
  parentCalled: boolean;
  officeNote: string;
  parentPhone: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateApplication, null);
  if (status === "withdrawn") return <p className={bill.pending}>Сурагч бүртгэлээ цуцалсан. Өөрчлөх зүйлгүй.</p>;
  const firstFree = slots.find((s) => s.mine || s.left > 0)?.id;

  return (
    <form onSubmit={submitKeepingValues(action)} className={bill.form}>
      <input type="hidden" name="id" value={id} />
      <label className={styles.consent}>
        <input type="checkbox" name="parentCalled" defaultChecked={parentCalled} />
        <span>
          Эцэг эх / асран хамгаалагч руу (<a href={`tel:${parentPhone}`}>{parentPhone}</a>) утасдаж зөвшөөрлийг нь баталгаажуулсан.
          <br />
          <small className={bill.muted}>Үүнийг тэмдэглэхээс өмнө баталгаажуулах боломжгүй.</small>
        </span>
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
        <legend className={bill.label} style={{ marginBottom: 6 }}>
          Сурагчийн боломжтой цагууд — нэгийг сонгож баталгаажуулна
        </legend>
        <div className={styles.slots}>
          {slots.map((s) => (
            <label key={s.id} className={styles.slot} data-full={s.left === 0 && !s.mine}>
              <input type="radio" name="slotId" value={s.id} defaultChecked={s.id === (slots.find((x) => x.mine)?.id ?? firstFree)} disabled={s.left === 0 && !s.mine} />
              <span className={styles.slotWhen}>
                <strong>{s.label}</strong>
                <span className={s.left || s.mine ? styles.spots : styles.full}>
                  {s.mine ? "Энэ сурагч энд баталгаажсан" : s.left ? `${s.left}/${s.capacity} суудал үлдсэн` : "Дүүрсэн"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={bill.label}>
        <span>
          Сурагчид харагдах зурвас <small>(заавал биш — жишээ нь: хаана уулзах, юу авч ирэх)</small>
        </span>
        <textarea name="officeNote" rows={3} maxLength={1000} defaultValue={officeNote} className={bill.input} />
      </label>

      <div className={bill.actions}>
        <button name="intent" value="confirm" className={bill.btnGold} disabled={pending}>
          {status === "accepted" ? "Цагийг шинэчлэх" : "Баталгаажуулах"}
        </button>
        <button name="intent" value="save" className={bill.btnGhost} disabled={pending}>
          Хадгалах
        </button>
        <button name="intent" value="waitlist" className={bill.btnGhost} disabled={pending}>
          Хүлээлгийн жагсаалт
        </button>
        <button name="intent" value="reject" className={bill.btnDanger} disabled={pending}>
          Татгалзах
        </button>
      </div>
      {state ? (
        <p className={state.ok ? bill.ok : bill.err} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
