"use client";

import { useActionState } from "react";
import { createAccount, resetPassword, type FormState } from "../actions";
import { submitKeepingValues } from "@/components/youth/submit";
import bill from "@/components/youth/forms.module.css";
import styles from "@/components/youth/youth.module.css";

function Result({ state }: { state: FormState }) {
  if (!state) return null;
  if (!state.ok) return <p className={bill.err} role="alert">{state.message}</p>;
  return (
    <p className={bill.ok} role="status">
      {state.message} {state.secret ? <span className={styles.secret}>{state.secret}</span> : null}
    </p>
  );
}

export function CreateAccount() {
  const [state, action, pending] = useActionState<FormState, FormData>(createAccount, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className={bill.form}>
      <div className={bill.row}>
        <label className={bill.label}>
          Нэвтрэх нэр
          <input name="username" required maxLength={40} className={bill.input} placeholder="bat.office" autoComplete="off" />
        </label>
        <label className={bill.label}>
          Албаны нэр (зар дээр харагдана)
          <input name="displayName" required maxLength={120} className={bill.input} placeholder="Г.Бат — УИХ-ын гишүүний ажлын алба" />
        </label>
      </div>
      <div className={bill.actions}>
        <button className={bill.btn} disabled={pending}>
          Эрх үүсгэх
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function ResetPassword({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, null);
  return (
    <form action={action} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="id" value={id} />
      <button className={bill.btnGhost} disabled={pending}>
        Нууц үг шинэчлэх
      </button>
      <Result state={state} />
    </form>
  );
}
