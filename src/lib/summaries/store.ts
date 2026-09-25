import "server-only";
import { listJson, readJson, updateJson } from "../store/jsonStore";
import type { BillExplainer } from "./types";

const file = (billId: number) => `summaries/${billId}.json`;

export async function getExplainer(billId: number): Promise<BillExplainer | null> {
  if (!Number.isInteger(billId) || billId <= 0) return null;
  return readJson<BillExplainer | null>(file(billId), null);
}

/** Public accessor: returns the explainer only once a person has approved it. */
export async function getApprovedExplainer(billId: number): Promise<BillExplainer | null> {
  const e = await getExplainer(billId);
  return e && e.status === "approved" && e.summary.length ? e : null;
}

export async function listExplainers(): Promise<BillExplainer[]> {
  const files = await listJson("summaries");
  const all = await Promise.all(files.map((f) => readJson<BillExplainer | null>(`summaries/${f}`, null)));
  return all.filter((e): e is BillExplainer => e !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Most recently approved explainer — used for the homepage "30 секундэд" block. */
export async function getFeaturedExplainer(): Promise<BillExplainer | null> {
  const approved = (await listExplainers()).filter((e) => e.status === "approved" && e.summary.length);
  return approved.sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))[0] ?? null;
}

export function saveExplainer(billId: number, fn: (current: BillExplainer | null) => BillExplainer): Promise<BillExplainer | null> {
  return updateJson<BillExplainer | null>(file(billId), null, (cur) => ({ ...fn(cur), updatedAt: new Date().toISOString() }));
}
