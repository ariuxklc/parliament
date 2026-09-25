"use client";

import { useActionState } from "react";
import { officeLogin, staffLogin, type FormState } from "../actions";
import { submitKeepingValues } from "@/components/youth/submit";
import bill from "@/components/youth/forms.module.css";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(officeLogin, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className={bill.form} style={{ marginTop: 20 }}>
      <input type="hidden" name="next" value={next} />
      <label className={bill.label}>
        Нэвтрэх нэр
        <input name="username" required autoFocus autoComplete="username" className={bill.input} />
      </label>
      <label className={bill.label}>
        Нууц үг
        <input name="password" type="password" required autoComplete="current-password" className={bill.input} />
      </label>
      <button disabled={pending} className={bill.btn}>
        Нэвтрэх
      </button>
      {state && !state.ok ? (
        <p role="alert" className={bill.err}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Secretariat (УИХ-ын Тамгын газар): the shared staff passcode — sees every office's listings. */
export function StaffLoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(staffLogin, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className={bill.form} style={{ marginTop: 12 }}>
      <label className={bill.label}>
        Тамгын газрын нууц код
        <input name="passcode" type="password" required autoComplete="current-password" className={bill.input} />
      </label>
      <button disabled={pending} className={bill.btnGhost}>
        Тамгын газраар нэвтрэх
      </button>
      {state && !state.ok ? (
        <p role="alert" className={bill.err}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
