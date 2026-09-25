// Demo-only Secretariat gate for the youth-opportunities admin (/dadlaga/admin): one shared passcode
// (STAFF_PASSCODE, server-side env only). The cookie holds a hash of the passcode, never the passcode
// itself. Not real authentication. If STAFF_PASSCODE is unset, the Secretariat login is simply off.

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const STAFF_COOKIE = "op_staff";

function token(passcode: string) {
  return createHash("sha256").update(`open-parliament:${passcode}`).digest("hex");
}

export function passcodeConfigured() {
  return Boolean(process.env.STAFF_PASSCODE);
}

export function checkPasscode(input: string) {
  const expected = process.env.STAFF_PASSCODE;
  if (!expected) return false;
  const a = Buffer.from(token(input));
  const b = Buffer.from(token(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionToken() {
  return token(process.env.STAFF_PASSCODE ?? "");
}

export async function isStaff() {
  if (!passcodeConfigured()) return false;
  return (await cookies()).get(STAFF_COOKIE)?.value === sessionToken();
}

export async function requireStaff(next = "/dadlaga/admin") {
  if (!(await isStaff())) redirect(`/dadlaga/admin/login?next=${encodeURIComponent(next)}`);
}
