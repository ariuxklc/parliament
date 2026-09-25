import "server-only";
import { createHash } from "node:crypto";
import { readJson, updateJson } from "../store/jsonStore";

/**
 * Anonymous support/oppose opinions on a bill (laptop demo, ./data/opinions.json).
 * Stored per bill: aggregate counts + a one-way hash of each browser's random cookie id, so a browser
 * can vote once and change its vote. No names, IPs, or other personal data are stored.
 * This is NOT an official submission and not a representative survey — the UI says so.
 */

export type Choice = "support" | "oppose";

interface BillOpinions {
  support: number;
  oppose: number;
  voters: Record<string, Choice>; // sha256(cookie id) → choice
}

type OpinionFile = Record<string, BillOpinions>;

const FILE = "opinions.json";

export interface OpinionTotals {
  support: number;
  oppose: number;
  total: number;
  mine: Choice | null;
}

const hash = (voterId: string) => createHash("sha256").update(`opinion:${voterId}`).digest("hex").slice(0, 40);

function totals(b: BillOpinions | undefined, voterHash: string | null): OpinionTotals {
  const support = b?.support ?? 0;
  const oppose = b?.oppose ?? 0;
  return { support, oppose, total: support + oppose, mine: voterHash ? (b?.voters[voterHash] ?? null) : null };
}

export async function getOpinions(billId: number, voterId: string | null): Promise<OpinionTotals> {
  const all = await readJson<OpinionFile>(FILE, {});
  return totals(all[String(billId)], voterId ? hash(voterId) : null);
}

export async function castOpinion(billId: number, voterId: string, choice: Choice): Promise<OpinionTotals> {
  const vh = hash(voterId);
  const all = await updateJson<OpinionFile>(FILE, {}, (cur) => {
    const b: BillOpinions = cur[String(billId)] ?? { support: 0, oppose: 0, voters: {} };
    const prev = b.voters[vh];
    if (prev === choice) return cur;
    if (prev) b[prev] = Math.max(0, b[prev] - 1);
    b[choice] += 1;
    b.voters[vh] = choice;
    return { ...cur, [String(billId)]: b };
  });
  return totals(all[String(billId)], vh);
}
