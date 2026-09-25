import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectBrief } from "./types.ts";
import type { ExtractionResult } from "../documents/extract.ts";

/**
 * File storage for the submitted-projects feature (laptop demo; a hosted deployment needs a database):
 *   data/project-summaries/<projectId>.json   AI briefs (committed — the demo set)
 *   data/project-links.json                   d.parliament project ↔ LawForum id, verified by shared file ids
 *   data/cache/project-docs/<fileId>.json     extracted text of official files (git-ignored, re-creatable)
 * Writes are atomic (temp file → rename). No `server-only` import: the offline script uses this too.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const BRIEF_DIR = path.join(DATA_DIR, "project-summaries");
const LINKS_FILE = path.join(DATA_DIR, "project-links.json");
const DOC_CACHE_DIR = path.join(DATA_DIR, "cache", "project-docs");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/* ---------------------------------------------------------------- briefs */

export async function readBrief(projectId: string): Promise<ProjectBrief | null> {
  if (!UUID.test(projectId)) return null;
  const b = await readJsonFile<ProjectBrief>(path.join(BRIEF_DIR, `${projectId}.json`));
  return b && b.projectId === projectId && Array.isArray(b.summary) && b.summary.length ? b : null;
}

export async function writeBrief(brief: ProjectBrief): Promise<void> {
  if (!UUID.test(brief.projectId)) throw new Error("invalid project id");
  await writeJsonFile(path.join(BRIEF_DIR, `${brief.projectId}.json`), brief);
}

export async function listBriefs(): Promise<ProjectBrief[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(BRIEF_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(names.map((n) => readBrief(n.replace(/\.json$/, "")).catch(() => null)));
  return all.filter((b): b is ProjectBrief => b !== null);
}

/* ---------------------------------------------------------------- LawForum links */

export interface ProjectLink {
  lawforumId: number | null;
  /** Number of official file ids both records list (0 when no candidate was confirmed). */
  sharedFiles: number;
  checkedAt: string;
}

let linkQueue: Promise<unknown> = Promise.resolve();

export async function readLinks(): Promise<Record<string, ProjectLink>> {
  return (await readJsonFile<Record<string, ProjectLink>>(LINKS_FILE)) ?? {};
}

export function writeLink(projectId: string, link: ProjectLink): Promise<void> {
  const next = linkQueue.catch(() => undefined).then(async () => {
    const all = await readLinks();
    all[projectId] = link;
    await writeJsonFile(LINKS_FILE, all);
  });
  linkQueue = next;
  return next;
}

/* ---------------------------------------------------------------- extracted-text cache */

export interface CachedExtraction {
  fileId: number;
  sha256: string;
  bytes: number;
  extractorVersion: number;
  extractedAt: string;
  result: ExtractionResult;
}

export async function readDocCache(fileId: number): Promise<CachedExtraction | null> {
  if (!Number.isInteger(fileId) || fileId <= 0) return null;
  return readJsonFile<CachedExtraction>(path.join(DOC_CACHE_DIR, `${fileId}.json`));
}

export async function writeDocCache(entry: CachedExtraction): Promise<void> {
  await writeJsonFile(path.join(DOC_CACHE_DIR, `${entry.fileId}.json`), entry);
}
