import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Account, Application, Opportunity, Slot } from "./types";

/**
 * JSON-file storage for the youth opportunities feature (data/store/, gitignored — it holds
 * minors' personal data). Laptop/demo only: a real deployment needs a database.
 */

const DIR = path.join(process.cwd(), "data", "store");
const file = (name: string) => path.join(DIR, `youth-${name}.json`);

function load<T>(name: string, fallback: T): T {
  const p = file(name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
}
function save(name: string, data: unknown) {
  mkdirSync(DIR, { recursive: true });
  const p = file(name);
  writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${p}.tmp`, p);
}

export const newId = () => randomBytes(6).toString("hex");
export const isId = (s: string) => /^[a-f0-9]{12}$/.test(s);

// ---------- opportunities ----------

export const listOpportunities = () => load<Opportunity[]>("opportunities", []);
export const getOpportunity = (id: string) => (isId(id) ? (listOpportunities().find((o) => o.id === id) ?? null) : null);

export function saveOpportunity(o: Opportunity) {
  const all = listOpportunities().filter((x) => x.id !== o.id);
  save("opportunities", [...all, o]);
}
export function deleteOpportunity(id: string) {
  save("opportunities", listOpportunities().filter((x) => x.id !== id));
  save("applications", listApplications().filter((a) => a.opportunityId !== id));
}

/** Published, not past its deadline, and has at least one future slot. */
export function isOpen(o: Opportunity, today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)) {
  return o.status === "published" && o.deadline >= today && o.slots.some((s) => s.date >= today);
}

// ---------- applications ----------

export const listApplications = () => load<Application[]>("applications", []);
export const getApplication = (id: string) => (isId(id) ? (listApplications().find((a) => a.id === id) ?? null) : null);

export function saveApplication(a: Application) {
  const all = listApplications().filter((x) => x.id !== a.id);
  save("applications", [...all, a]);
}

/** Confirmed (accepted) students per slot. */
export function slotUsage(opportunityId: string) {
  const used = new Map<string, number>();
  for (const a of listApplications())
    if (a.opportunityId === opportunityId && a.status === "accepted" && a.confirmedSlotId)
      used.set(a.confirmedSlotId, (used.get(a.confirmedSlotId) ?? 0) + 1);
  return used;
}
export const spotsLeft = (s: Slot, used: Map<string, number>) => Math.max(0, s.capacity - (used.get(s.id) ?? 0));

/** Tracking code without look-alike characters (no 0/O, 1/I/L), e.g. "DL-7K3F-9QXM" (~40 bits). */
export function newCode() {
  const abc = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => abc[b % abc.length]).join("");
  return `DL-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}
export const normalizeCode = (s: string) => {
  const c = s.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^DL/, "");
  return c.length === 8 ? `DL-${c.slice(0, 4)}-${c.slice(4)}` : null;
};

// ---------- accounts ----------

export const listAccounts = () => load<Account[]>("accounts", []);
export const getAccount = (id: string) => listAccounts().find((a) => a.id === id) ?? null;
export function saveAccount(a: Account) {
  save("accounts", [...listAccounts().filter((x) => x.id !== a.id), a]);
}
