import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Tiny JSON-file store for the laptop demo (summaries, opinion totals, uploaded videos).
 * Everything lives under ./data. Writes are serialised per file and atomic (write temp → rename).
 * Not for multi-instance hosting: an online deployment needs a real database.
 *
 * On Vercel the deployment folder is read-only, so writes go to the instance's temp folder and reads look
 * there first, then at the files shipped with the deployment. That copy is temporary: votes and newly
 * written summaries on the hosted demo reset whenever Vercel starts a fresh instance.
 */

export const DATA_DIR = path.join(process.cwd(), "data");
const WRITE_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "open-parliament-data") : DATA_DIR;

const queues = new Map<string, Promise<unknown>>();

function resolveIn(dir: string, rel: string): string {
  const full = path.resolve(dir, rel);
  if (!full.startsWith(dir + path.sep)) throw new Error("path escapes data dir");
  return full;
}
const resolve = (rel: string) => resolveIn(DATA_DIR, rel);

async function readFrom<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  if (WRITE_DIR !== DATA_DIR) {
    const written = await readFrom<T>(resolveIn(WRITE_DIR, rel));
    if (written !== undefined) return written;
  }
  return (await readFrom<T>(resolve(rel))) ?? fallback;
}

async function writeJsonNow(rel: string, value: unknown): Promise<void> {
  const full = resolveIn(WRITE_DIR, rel);
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
  const dirs = WRITE_DIR !== DATA_DIR ? [resolve(dirRel), resolveIn(WRITE_DIR, dirRel)] : [resolve(dirRel)];
  const names = new Set<string>();
  for (const d of dirs) {
    try {
      for (const f of await fs.readdir(d)) if (f.endsWith(".json")) names.add(f);
    } catch {
      // missing folder: nothing there
    }
  }
  return [...names];
}

export function dataPath(rel: string): string {
  return resolve(rel);
}
