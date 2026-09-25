"use client";

import { useActionState, useState } from "react";
import { saveListing, type FormState } from "@/app/dadlaga/admin/actions";
import { submitKeepingValues } from "@/components/youth/submit";
import { MODES, OPPORTUNITY_TYPES, type Opportunity, type Slot } from "@/lib/youth/types";
import bill from "@/components/youth/forms.module.css";
import styles from "./youth.module.css";

type Row = Slot & { key: number; booked: number };
const GRADES = [6, 7, 8, 9, 10, 11, 12];

export function ListingForm({
  listing,
  booked,
  defaultHost,
  owners,
  savedMessage,
}: {
  listing: Opportunity | null;
  booked: Record<string, number>; // confirmed students per slot
  defaultHost: string;
  owners: { id: string; name: string }[] | null; // Secretariat only: who owns the listing
  savedMessage?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveListing, savedMessage ? { ok: true, message: savedMessage } : null);
  let next = 0;
  const [rows, setRows] = useState<Row[]>(() =>
    (listing?.slots.length ? listing.slots : [{ id: "", date: "", start: "10:00", end: "13:00", capacity: 3 }]).map((s) => ({ ...s, key: next++, booked: booked[s.id] ?? 0 })),
  );
  const [counter, setCounter] = useState(1000);
  // After a save, take the slots back from the server: new rows now have ids (sorted by time).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok && state.slots) {
      const bookedById = new Map(rows.map((r) => [r.id, r.booked]));
      setRows(state.slots.map((s, i) => ({ ...s, key: counter + i, booked: bookedById.get(s.id) ?? 0 })));
      setCounter(counter + state.slots.length);
    }
  }
  const add = () => {
    const last = rows[rows.length - 1];
    setRows([...rows, { id: "", date: last?.date ?? "", start: last?.start ?? "10:00", end: last?.end ?? "13:00", capacity: last?.capacity ?? 3, key: counter, booked: 0 }]);
    setCounter(counter + 1);
  };
  const o = listing;

  return (
    <form onSubmit={submitKeepingValues(action)} className={bill.form}>
      {o ? <input type="hidden" name="id" value={o.id} /> : null}
      {owners ? (
        <label className={bill.label}>
          Хариуцах ажлын алба
          <select name="ownerId" defaultValue={o?.ownerId ?? "secretariat"} className={bill.input}>
            <option value="secretariat">УИХ-ын Тамгын газар</option>
            {owners.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className={bill.row}>
        <label className={bill.label}>
          Төрөл
          <select name="type" defaultValue={o?.type ?? "shadow"} className={bill.input}>
            {Object.entries(OPPORTUNITY_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={bill.label}>
          Хэлбэр
          <select name="mode" defaultValue={o?.mode ?? "onsite"} className={bill.input}>
            {Object.entries(MODES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={bill.label}>
        Гарчиг
        <input name="title" required maxLength={120} defaultValue={o?.title} className={bill.input} placeholder="Жишээ: Гишүүнтэй хамт нэг өдөр — Төрийн ордонд" />
      </label>
      <label className={bill.label}>
        Зохион байгуулагч (сурагчдад харагдана)
        <input name="host" required maxLength={160} defaultValue={o?.host ?? defaultHost} className={bill.input} />
      </label>
      <label className={bill.label}>
        <span>
          Товч тайлбар <small>(картад харагдана, 1 өгүүлбэр)</small>
        </span>
        <input name="summary" required maxLength={200} defaultValue={o?.summary} className={bill.input} />
      </label>
      <label className={bill.label}>
        Дэлгэрэнгүй
        <textarea name="description" required rows={5} maxLength={4000} defaultValue={o?.description} className={bill.input} />
      </label>
      <label className={bill.label}>
        <span>
          Юу хийх вэ <small>(мөр бүр нэг ажил)</small>
        </span>
        <textarea name="tasks" rows={4} maxLength={2000} defaultValue={o?.tasks.join("\n")} className={bill.input} placeholder={"Чуулганы хуралдаан ажиглах\nИргэдийн өргөдөл ангилахад туслах"} />
      </label>
      <label className={bill.label}>
        <span>
          Шаардлага <small>(заавал биш)</small>
        </span>
        <textarea name="requirements" rows={2} maxLength={1500} defaultValue={o?.requirements} className={bill.input} />
      </label>
      <div className={bill.row}>
        <label className={bill.label}>
          Анги (доод)
          <select name="gradeMin" defaultValue={o?.gradeMin ?? 9} className={bill.input}>
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className={bill.label}>
          Анги (дээд)
          <select name="gradeMax" defaultValue={o?.gradeMax ?? 12} className={bill.input}>
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={bill.row}>
        <label className={bill.label}>
          Байршил
          <input name="location" maxLength={200} defaultValue={o?.location} className={bill.input} placeholder="Төрийн ордон, Улаанбаатар" />
        </label>
        <label className={bill.label}>
          Бүртгэл хаагдах өдөр
          <input name="deadline" type="date" required defaultValue={o?.deadline} className={bill.input} />
        </label>
      </div>

      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
        <legend className={bill.label} style={{ padding: "0 6px" }}>
          Цагийн хуваарь — сурагчид боломжтой цагуудаа сонгоно, та нэгийг баталгаажуулна
        </legend>
        {rows.map((r, i) => (
          <div key={r.key} className={styles.slotRow}>
            <input type="hidden" name="slotId" value={r.id} />
            <label className={bill.label}>
              Өдөр
              <input name="slotDate" type="date" defaultValue={r.date} className={bill.input} />
            </label>
            <label className={bill.label}>
              Эхлэх
              <input name="slotStart" type="time" defaultValue={r.start} className={bill.input} />
            </label>
            <label className={bill.label}>
              Дуусах
              <input name="slotEnd" type="time" defaultValue={r.end} className={bill.input} />
            </label>
            <label className={bill.label}>
              <span>
                Суудал{r.booked ? <small> ({r.booked} баталсан)</small> : null}
              </span>
              <input name="slotCap" type="number" min={Math.max(1, r.booked)} max={200} defaultValue={r.capacity} className={bill.input} />
            </label>
            <button
              type="button"
              className={bill.btnGhost}
              disabled={r.booked > 0}
              title={r.booked ? "Баталгаажсан сурагчтай цагийг устгах боломжгүй" : "Энэ цагийг хасах"}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              aria-label={`${i + 1}-р цагийг хасах`}
            >
              ✕
            </button>
          </div>
        ))}
        <div>
          <button type="button" className={bill.btnGhost} onClick={add}>
            + Цаг нэмэх
          </button>
        </div>
      </fieldset>

      <div className={bill.actions}>
        <button name="intent" value="publish" className={bill.btnGold} disabled={pending}>
          {o?.status === "published" ? "Хадгалах" : "Нийтлэх"}
        </button>
        {o?.status !== "published" ? (
          <button name="intent" value="draft" className={bill.btnGhost} disabled={pending}>
            Ноорог болгож хадгалах
          </button>
        ) : (
          <>
            <button name="intent" value="draft" className={bill.btnGhost} disabled={pending}>
              Нийтлэлээс буулгах
            </button>
            <button name="intent" value="close" className={bill.btnGhost} disabled={pending}>
              Бүртгэл хаах
            </button>
          </>
        )}
        {pending ? <span className={bill.muted}>Хадгалж байна…</span> : null}
        {state ? <span className={state.ok ? bill.ok : bill.err} role={state.ok ? "status" : "alert"}>{state.message}</span> : null}
      </div>
    </form>
  );
}
