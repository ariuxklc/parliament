import "server-only";
import type { Loaded } from "./types";

export class SourceError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

interface FetchJsonOptions {
  timeoutMs?: number;
  /** Seconds to keep the response in the Next.js data cache. Omit for no caching. */
  revalidate?: number;
  tags?: string[];
}

/**
 * GET JSON from a public source. Only for unauthenticated requests —
 * authenticated calls live in `sources/parliamentApi.ts` and are never put in the shared data cache.
 */
export async function fetchJson<T>(source: string, url: string, opts: FetchJsonOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      ...(opts.revalidate !== undefined ? { next: { revalidate: opts.revalidate, tags: opts.tags } } : { cache: "no-store" }),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network error";
    throw new SourceError(source, undefined, `${source}: ${reason}`);
  }
  if (!res.ok) throw new SourceError(source, res.status, `${source}: HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SourceError(source, res.status, `${source}: malformed JSON`);
  }
}

/** Wraps a loader so one failing source never breaks the whole page. */
export async function load<T>(label: string, fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    const data = await fn();
    return { ok: true, data, fetchedAt: new Date().toISOString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Messages never contain credentials or tokens — only source name + status.
    console.warn(`[data] ${label} unavailable: ${message}`);
    return { ok: false, error: message };
  }
}

/** Tiny in-process TTL cache for results that must not go into the shared fetch cache. */
export function ttlCache<V>(ttlMs: number) {
  const store = new Map<string, { value: V; expires: number }>();
  const inflight = new Map<string, Promise<V>>();
  return async (key: string, produce: () => Promise<V>): Promise<V> => {
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const running = inflight.get(key);
    if (running) return running;
    const p = produce()
      .then((value) => {
        store.set(key, { value, expires: Date.now() + ttlMs });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}

/** Run async work over items with bounded concurrency (polite to official servers). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
