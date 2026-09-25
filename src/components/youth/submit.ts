import { startTransition, type FormEvent } from "react";

/**
 * Submit a form to a useActionState action WITHOUT React 19's automatic form reset, so a
 * refused save (validation error) keeps what the person typed. The clicked button's
 * name/value (e.g. intent=approve) is included via the submitter.
 */
export function submitKeepingValues(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => action(fd));
  };
}
