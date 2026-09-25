import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/staff-auth";
import { getAccount, listAccounts } from "./store";
import type { Account } from "./types";

/**
 * Logins for the youth-opportunities admin (/dadlaga/admin):
 * - each MP office has its own account (username + password, scrypt-hashed), created by the Secretariat;
 * - the Secretariat signs in with the staff passcode (STAFF_PASSCODE, src/lib/staff-auth.ts) = super-admin.
 * Office sessions are a signed cookie "<accountId>.<expiry>.<hmac>"; the signing key comes from
 * YOUTH_SESSION_SECRET or is generated once into data/store (gitignored).
 */

export const OFFICE_COOKIE = "op_office";
const SESSION_HOURS = 8;

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function secret() {
  if (process.env.YOUTH_SESSION_SECRET) return process.env.YOUTH_SESSION_SECRET;
  const dir = path.join(process.cwd(), "data", "store");
  const p = path.join(dir, "youth-session.key");
  if (!existsSync(p)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(p, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(p, "utf8").trim();
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

export function sessionFor(accountId: string) {
  const v = `${accountId}.${Date.now() + SESSION_HOURS * 3600_000}`;
  return { value: `${v}.${sign(v)}`, maxAge: SESSION_HOURS * 3600 };
}

export type Viewer = { kind: "super"; name: string } | { kind: "office"; account: Account };

/** Who is using the admin: the Secretariat (staff login) or an MP office. */
export async function currentViewer(): Promise<Viewer | null> {
  if (await isStaff()) return { kind: "super", name: "УИХ-ын Тамгын газар" };
  const raw = (await cookies()).get(OFFICE_COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, mac] = raw.split(".");
  if (!id || !exp || !mac) return null;
  const expected = sign(`${id}.${exp}`);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  const account = getAccount(id);
  return account?.active ? { kind: "office", account } : null;
}

export async function requireViewer(next = "/dadlaga/admin"): Promise<Viewer> {
  const v = await currentViewer();
  if (!v) redirect(`/dadlaga/admin/login?next=${encodeURIComponent(next)}`);
  return v;
}

/** Can this viewer manage an opportunity owned by `ownerId`? */
export const canManage = (v: Viewer, ownerId: string) => v.kind === "super" || v.account.id === ownerId;

export function findByUsername(username: string) {
  return listAccounts().find((a) => a.username.toLowerCase() === username.toLowerCase()) ?? null;
}
