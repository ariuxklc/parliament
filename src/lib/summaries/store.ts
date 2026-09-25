import "server-only";
import { readJson, updateJson } from "../store/jsonStore";
import type { BillExplainer } from "./types";
import { findVideo } from "./video";

const file = (billId: number) => `summaries/${billId}.json`;

/** The bill featured on the homepage "30 секундын AI тайлбар" block — change this id to feature another bill. */
export const FEATURED_BILL_ID = 11151;

/** Cached explainer (any status) with its video attached; null if none has been generated yet. */
export async function getExplainer(billId: number): Promise<BillExplainer | null> {
  if (!Number.isInteger(billId) || billId <= 0) return null;
  const e = await readJson<(BillExplainer & { status: string }) | null>(file(billId), null);
  if (!e || !e.summary?.length) return null;
  return { ...e, status: e.status === "approved" ? "approved" : "ai", video: await findVideo(billId) };
}

/** Homepage block: the featured bill's cached explainer (never generates on homepage load). */
export function getFeaturedExplainer(): Promise<BillExplainer | null> {
  return getExplainer(FEATURED_BILL_ID);
}

export function saveExplainer(billId: number, value: BillExplainer): Promise<BillExplainer | null> {
  return updateJson<BillExplainer | null>(file(billId), null, () => ({ ...value, video: null, updatedAt: new Date().toISOString() }));
}
