import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Tiny JSON-file store for the laptop demo (summaries, opinion totals, uploaded videos).
 * Everything lives under ./data. Writes are serialised per file and atomic (write temp → rename).
 * Not for multi-instance hosting: an online deployment needs a real database.
 */

export const DATA_DIR = path.join(process.cwd(), "data");

const queues = new Map<string, Promise<unknown>>();

function resolve(rel: string): string {
  const full = path.resolve(DATA_DIR, rel);
  if (!full.startsWith(DATA_DIR + path.sep)) throw new Error("path escapes data dir");
  return full;
}

export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(resolve(rel), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJsonNow(rel: string, value: unknown): Promise<void> {
  const full = resolve(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, full);
}

/** Read-modify-write under a per-file lock so concurrent requests never lose updates. */
export function updateJson<T>(rel: string, fallback: T, fn: (current: T) => T | Promise<T>): Promise<T> {
  const prev = queues.get(rel) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const current = await readJson<T>(rel, fallback);
      const updated = await fn(current);
      await writeJsonNow(rel, updated);
      return updated;
    });
  queues.set(rel, next);
  return next;
}

export async function listJson(dirRel: string): Promise<string[]> {
  try {
    return (await fs.readdir(resolve(dirRel))).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

export function dataPath(rel: string): string {
  return resolve(rel);
}
