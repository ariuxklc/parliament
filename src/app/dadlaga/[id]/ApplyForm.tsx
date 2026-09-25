"use client";

import { useActionState } from "react";
import Link from "next/link";
import { apply, type ApplyState } from "../actions";
import { submitKeepingValues } from "@/components/youth/submit";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";

type SlotView = { id: string; label: string; left: number; capacity: number };

export function ApplyForm({ opportunityId, slots, gradeMin, gradeMax }: { opportunityId: string; slots: SlotView[]; gradeMin: number; gradeMax: number }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(apply.bind(null, opportunityId), null);

  if (state?.ok) {
    return (
      <div className={bill.form} role="status">
        <p className={styles.statusBig}>Бүртгэл амжилттай илгээгдлээ</p>
        <p>Таны кодыг хадгалаарай — хариугаа үүгээр шалгана:</p>
        <p>
          <span className={styles.code}>{state.code}</span>
        </p>
        <p className={bill.muted}>Сонгосон цаг: {state.slots.join(" · ")}</p>
        <ol className={styles.tasks}>
          <li>Ажлын алба таны эцэг эх/асран хамгаалагч руу утасдаж зөвшөөрлийг баталгаажуулна.</li>
          <li>Таныг аль нэг цагт баталгаажуулбал &quot;Төлөв шалгах&quot; хуудсанд харагдана.</li>
          <li>Бүртгэлээ цуцлах бол мөн тэр хуудаснаас цуцална.</li>
        </ol>
        <p>
          <Link href={`/dadlaga/status?code=${state.code}`} className={bill.btn}>
            Төлөв шалгах
          </Link>
        </p>
      </div>
    );
  }

  const err = (field: string) => (state && !state.ok && state.field === field ? state.message : null);
  return (
    <form onSubmit={submitKeepingValues(action)} className={bill.form} noValidate>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
        <legend className={bill.label} style={{ marginBottom: 6 }}>
          1. Боломжтой цагаа сонго (хэд хэдийг сонгож болно)
        </legend>
        <div className={styles.slots}>
          {slots.map((s) => (
            <label key={s.id} className={styles.slot} data-full={s.left === 0}>
              <input type="checkbox" name="slot" value={s.id} disabled={s.left === 0} />
              <span className={styles.slotWhen}>
                <strong>{s.label}</strong>
                <span className={s.left ? styles.spots : styles.full}>{s.left ? `${s.left}/${s.capacity} суудал үлдсэн` : "Дүүрсэн"}</span>
              </span>
            </label>
          ))}
        </div>
        {err("slot") ? <span className={bill.err}>{err("slot")}</span> : null}
      </fieldset>

      <p className={bill.label} style={{ marginTop: 8 }}>
        2. Өөрийн мэдээлэл
      </p>
      <div className={bill.row}>
        <label className={bill.label}>
          Овог нэр
          <input name="name" required maxLength={80} className={bill.input} autoComplete="name" aria-invalid={Boolean(err("name"))} />
        </label>
        <label className={bill.label}>
          Сургууль
          <input name="school" required maxLength={120} className={bill.input} placeholder="Жишээ: 23-р сургууль" />
        </label>
      </div>
      <div className={bill.row}>
        <label className={bill.label}>
          Анги
          <select name="grade" className={bill.input} defaultValue="">
            <option value="" disabled>
              Сонгох
            </option>
            {Array.from({ length: gradeMax - gradeMin + 1 }, (_, i) => gradeMin + i).map((g) => (
              <option key={g} value={g}>
                {g}-р анги
              </option>
            ))}
          </select>
        </label>
        <label className={bill.label}>
          Утас
          <input name="phone" required inputMode="tel" maxLength={20} className={bill.input} placeholder="8 оронтой" autoComplete="tel" />
        </label>
      </div>
      <label className={bill.label}>
        <span>
          И-мэйл <small>(заавал биш)</small>
        </span>
        <input name="email" type="email" maxLength={120} className={bill.input} autoComplete="email" />
      </label>
      {["name", "school", "grade", "phone", "email"].map((f) => (err(f) ? <span key={f} className={bill.err}>{err(f)}</span> : null))}

      <p className={bill.label} style={{ marginTop: 8 }}>
        3. Эцэг эх / асран хамгаалагч
      </p>
      <div className={bill.row}>
        <label className={bill.label}>
          Нэр
          <input name="parentName" required maxLength={80} className={bill.input} />
        </label>
        <label className={bill.label}>
          Утас
          <input name="parentPhone" required inputMode="tel" maxLength={20} className={bill.input} placeholder="8 оронтой" />
        </label>
      </div>
      <label className={styles.consent}>
        <input type="checkbox" name="consent" />
        <span>
          Миний эцэг эх / асран хамгаалагч энэ хөтөлбөрт оролцохыг зөвшөөрсөн. Ажлын алба баталгаажуулахын өмнө тэдэн рүү утасдана гэдгийг би мэдэж
          байна.
        </span>
      </label>
      {["parentName", "parentPhone", "consent"].map((f) => (err(f) ? <span key={f} className={bill.err}>{err(f)}</span> : null))}

      <label className={bill.label} style={{ marginTop: 8 }}>
        4. Яагаад оролцохыг хүсэж байна вэ?
        <textarea name="motivation" required minLength={30} maxLength={1200} rows={4} className={bill.input} placeholder="Юу сурахыг хүсэж байна, ямар сэдэв сонирхдог вэ…" />
      </label>
      {err("motivation") ? <span className={bill.err}>{err("motivation")}</span> : null}
      <input name="website" tabIndex={-1} autoComplete="off" hidden aria-hidden="true" />

      <p className={bill.muted}>
        Таны мэдээллийг зөвхөн энэ зарыг оруулсан ажлын алба болон УИХ-ын Тамгын газар харна. Олон нийтэд нийтлэхгүй.
      </p>
      <div className={bill.actions}>
        <button className={bill.btnGold} disabled={pending}>
          {pending ? "Илгээж байна…" : "Бүртгүүлэх"}
        </button>
        {state && !state.ok && !state.field ? <span className={bill.err}>{state.message}</span> : null}
      </div>
    </form>
  );
}
