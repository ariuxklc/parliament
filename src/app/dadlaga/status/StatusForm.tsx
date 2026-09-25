"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { lookup, withdraw, type StatusState } from "../actions";
import { submitKeepingValues } from "@/components/youth/submit";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";

// The path an application takes, shown as a timeline; rejected/withdrawn end it early.
const STEPS = [
  { key: "submitted", label: "Илгээсэн" },
  { key: "reviewing", label: "Хянаж байна" },
  { key: "accepted", label: "Баталгаажсан" },
] as const;

function Timeline({ status }: { status: string }) {
  const reached = status === "accepted" ? 3 : status === "submitted" ? 1 : 2;
  const bad = status === "rejected" || status === "withdrawn";
  return (
    <ol className={styles.timeline} aria-label="Явц">
      {STEPS.map((s, i) => (
        <li key={s.key} data-state={i < reached && !(bad && i === 2) ? "done" : undefined}>
          {s.label}
        </li>
      ))}
      {status === "waitlist" ? <li data-state="done">Хүлээлгийн жагсаалт</li> : null}
      {bad ? <li data-state="bad">{status === "rejected" ? "Энэ удаад тэнцээгүй" : "Цуцалсан"}</li> : null}
    </ol>
  );
}

export function StatusForm({ initialCode }: { initialCode: string }) {
  const [phone, setPhone] = useState("");
  const [found, find, finding] = useActionState<StatusState, FormData>(lookup, null);
  const [after, cancel, cancelling] = useActionState<StatusState, FormData>(withdraw, null);
  // The newest answer wins: a withdrawal result replaces the lookup result.
  const state = after?.ok && found?.ok && after.view.code === found.view.code ? after : found;
  const v = state?.ok ? state.view : null;

  return (
    <div className={bill.stack}>
      <form onSubmit={submitKeepingValues(find)} className={bill.form}>
        <div className={bill.row}>
          <label className={bill.label}>
            Бүртгэлийн код
            <input name="code" required defaultValue={initialCode} className={bill.input} placeholder="DL-XXXX-XXXX" autoCapitalize="characters" />
          </label>
          <label className={bill.label}>
            Бүртгүүлсэн утасны дугаар
            <input name="phone" required inputMode="tel" className={bill.input} placeholder="8 оронтой" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <div className={bill.actions}>
          <button className={bill.btn} disabled={finding}>
            {finding ? "Хайж байна…" : "Шалгах"}
          </button>
          {found && !found.ok ? <span className={bill.err}>{found.message}</span> : null}
        </div>
      </form>

      {v ? (
        <section className={bill.panel} aria-live="polite">
          <p className={bill.muted}>
            <span className={styles.code} style={{ fontSize: 18, padding: "4px 10px" }}>
              {v.code}
            </span>
          </p>
          <h2 className={bill.h3}>
            <Link href={`/dadlaga/${v.opportunityId}`}>{v.title}</Link>
          </h2>
          {v.host ? <p className={bill.muted}>{v.host}</p> : null}
          <p className={styles.statusBig} style={{ marginTop: 12 }}>
            {v.statusLabel}
          </p>
          <Timeline status={v.status} />

          {v.confirmed ? (
            <div className={bill.okPanel} style={{ marginTop: 16, padding: 14, borderRadius: 10 }}>
              <strong>Таны цаг: {v.confirmed}</strong>
              {v.location ? <p>Байршил: {v.location}</p> : null}
            </div>
          ) : v.chosen.length ? (
            <p style={{ marginTop: 12 }}>
              <span className={bill.muted}>Таны сонгосон цагууд:</span> {v.chosen.join(" · ")}
            </p>
          ) : null}

          {v.officeNote ? (
            <blockquote className={bill.quote} style={{ marginTop: 14 }}>
              <small>Ажлын албаны зурвас</small>
              <p style={{ whiteSpace: "pre-line" }}>{v.officeNote}</p>
            </blockquote>
          ) : null}

          <p className={bill.muted} style={{ marginTop: 12 }}>
            Сүүлд шинэчилсэн: {new Date(v.updatedAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" })}
          </p>

          {v.status !== "withdrawn" && v.status !== "rejected" ? (
            <form
              onSubmit={(e) => {
                if (!confirm("Бүртгэлээ цуцлах уу? Буцааж сэргээх боломжгүй.")) return e.preventDefault();
                submitKeepingValues(cancel)(e);
              }}
              style={{ marginTop: 16 }}
            >
              <input type="hidden" name="code" value={v.code} />
              {/* the server checks code + phone again before withdrawing */}
              <input type="hidden" name="phone" value={phone} />
              <button className={bill.btnDanger} disabled={cancelling}>
                {cancelling ? "Цуцалж байна…" : "Бүртгэлээ цуцлах"}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
