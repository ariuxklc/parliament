import "server-only";

/**
 * Single-process abuse and cost guards for the hackathon demo. A multi-instance deployment needs a
 * shared store (KV/Redis) for these counters. No question text is kept.
 */

const PER_MINUTE = 8;
const PER_HOUR = 60;
const DAILY_REQUESTS = 1_500;
// Each question takes 2–6 model rounds (tool use), so the budget counts rounds.
const DAILY_MODEL_CALLS = 2_000;

type Window = { count: number; resetAt: number };
const minute = new Map<string, Window>();
const hour = new Map<string, Window>();
let daily = { day: "", requests: 0, modelCalls: 0 };
const active = new Set<string>();

function hit(store: Map<string, Window>, key: string, limit: number, ms: number, now: number): boolean {
  const current = store.get(key);
  const bucket = !current || now >= current.resetAt ? { count: 0, resetAt: now + ms } : current;
  if (bucket.count >= limit) return false;
  bucket.count++;
  store.set(key, bucket);
  if (store.size > 5_000) for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
  return true;
}

function rollDay(now: number) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (daily.day !== day) daily = { day, requests: 0, modelCalls: 0 };
}

export type Admission = { ok: true; release: () => void } | { ok: false; status: 429 | 503; message: string };

/** Admit one request for `ip` + `client` (browser session id). Call `release()` when done. */
export function admitChatRequest(ip: string, client: string, now = Date.now()): Admission {
  rollDay(now);
  const key = `${ip}|${client}`;
  if (active.has(key)) return { ok: false, status: 429, message: "Өмнөх асуултын хариу бэлтгэгдэж байна. Түр хүлээнэ үү." };
  if (daily.requests >= DAILY_REQUESTS) return { ok: false, status: 503, message: "Өнөөдрийн асуултын хязгаарт хүрлээ. Маргааш дахин оролдоно уу." };
  if (!hit(minute, ip, PER_MINUTE, 60_000, now) || !hit(hour, ip, PER_HOUR, 3_600_000, now)) {
    return { ok: false, status: 429, message: "Асуултын хязгаарт хүрлээ. Түр хүлээгээд дахин оролдоно уу." };
  }
  daily.requests++;
  active.add(key);
  return { ok: true, release: () => active.delete(key) };
}

/** Budget for paid model rounds across all users. */
export function allowModelCall(now = Date.now()): boolean {
  rollDay(now);
  if (daily.modelCalls >= DAILY_MODEL_CALLS) return false;
  daily.modelCalls++;
  return true;
}
