import "server-only";
import { serverEnv } from "../env";
import { SourceError, ttlCache } from "../http";

/**
 * Parliament API (hackathon credentials, server-side only).
 * Docs: http://202.21.104.13/ParliamentAPI/docs/
 *
 * Auth quirk (verified 2026-09-25): the bearer token from POST /api/login is bound to the
 * JSESSIONID cookie set on that same response. Requests must carry BOTH
 * `Authorization: Bearer <token>` and the cookie, otherwise the API answers 401 {"msg":"token buruu"}.
 *
 * Read-only by construction: only the whitelisted `func` values below can be called.
 * The API also exposes /api/changePassword and /api/resetPassword — never call those.
 *
 * Data notes:
 *  - getAgendaList → 420 plenary agenda items. `agendaCode` = YYYY + SS + NNNNN where SS is the session:
 *      01 → spring regular session (votes dated Apr–Jun), 02 → autumn regular session (votes dated Oct–Dec).
 *      00 appeared only for a "Тест хурал" (test meeting) record and is excluded.
 *  - getMeetings only returns plenary meetings ("ЧУУЛГАНЫ НЭГДСЭН ХУРАЛДААН"), 2025-03 onward.
 *  - /Service report functions (getMembers, getAttends…) return empty data for hackathon accounts.
 */

type ReadOnlyFunc = "getAgendaList" | "getAgendaVoteList" | "getMeetings" | "getVotingList" | "getVotingResult";

interface Session { token: string; cookie: string; expiresAt: number }

let session: Session | null = null;
let loggingIn: Promise<Session> | null = null;

async function login(): Promise<Session> {
  const cfg = serverEnv.parliamentApi;
  if (!cfg) throw new SourceError("Parliament API", undefined, "Parliament API: credentials not configured");
  const res = await fetch(`${cfg.baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: cfg.username, password: cfg.password }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new SourceError("Parliament API", res.status, `Parliament API: login failed (HTTP ${res.status})`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  if (!body.access_token) throw new SourceError("Parliament API", res.status, "Parliament API: login returned no token");
  // Refresh a minute early; the API issues 6 h tokens.
  return { token: body.access_token, cookie, expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 };
}

async function getSession(force = false): Promise<Session> {
  if (!force && session && session.expiresAt > Date.now()) return session;
  loggingIn ??= login().finally(() => (loggingIn = null));
  session = await loggingIn;
  return session;
}

async function call<T>(func: ReadOnlyFunc, params: Record<string, string | number> = {}, retried = false): Promise<T> {
  const cfg = serverEnv.parliamentApi;
  if (!cfg) throw new SourceError("Parliament API", undefined, "Parliament API: credentials not configured");
  const s = await getSession();
  const res = await fetch(`${cfg.baseUrl}/ParliamentService`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}`, Cookie: s.cookie },
    body: JSON.stringify({ func, ...params }),
    cache: "no-store", // never place authenticated responses in the shared fetch cache
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 401 && !retried) {
    await getSession(true);
    return call<T>(func, params, true);
  }
  if (!res.ok) throw new SourceError("Parliament API", res.status, `Parliament API ${func}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/* ---------- typed read-only helpers ---------- */

export interface RawAgendaItem { agendaCode: string; agendaName: string }

const agendaCache = ttlCache<RawAgendaItem[]>(30 * 60 * 1000);

export const parliamentApi = {
  isConfigured: () => serverEnv.parliamentApi !== null,
  agendaList: () =>
    agendaCache("agenda", async () => {
      const res = await call<{ data?: RawAgendaItem[] }>("getAgendaList");
      return Array.isArray(res.data) ? res.data : [];
    }),
};
