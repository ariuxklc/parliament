import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fetchProject, fetchProjectTeam, fetchSubmittedProjects } from "./dparliament.ts";
import { normalizeProject, toInitiator } from "./normalize.ts";
import type { ProjectCatalogMeta, ProjectInitiator, ProjectListItem, SubmittedProject } from "./types.ts";
import { getBriefIndex } from "../project-summaries/read.ts";
import { ROLE_LABEL, roleOf } from "../project-summaries/sources.ts";
import type { DocRole } from "../project-summaries/types.ts";

/**
 * Server-side access to «Өргөн мэдүүлсэн төслүүд» for pages.
 * The list (~2 MB from d.parliament.mn) is cached in-process for 30 minutes. The last good copy is also
 * saved to data/cache/, so the pages keep working (marked stale) when the official API is down.
 */

const TTL = 30 * 60_000;
const SNAPSHOT = path.join(process.cwd(), "data", "cache", "project-catalog.json");

let cache: { at: number; projects: SubmittedProject[]; fetchedAt: string } | null = null;
let inflight: Promise<{ projects: SubmittedProject[]; meta: ProjectCatalogMeta }> | null = null;

async function saveSnapshot(projects: SubmittedProject[], fetchedAt: string) {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT), { recursive: true });
    const tmp = `${SNAPSHOT}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ fetchedAt, projects }), "utf8");
    await fs.rename(tmp, SNAPSHOT);
  } catch {
    // a snapshot is a convenience only
  }
}

async function loadSnapshot(): Promise<{ fetchedAt: string; projects: SubmittedProject[] } | null> {
  try {
    return JSON.parse(await fs.readFile(SNAPSHOT, "utf8"));
  } catch {
    return null;
  }
}

export async function getSubmittedProjects(): Promise<{ projects: SubmittedProject[]; meta: ProjectCatalogMeta }> {
  if (cache && Date.now() - cache.at < TTL) {
    return { projects: cache.projects, meta: { total: cache.projects.length, fetchedAt: cache.fetchedAt, stale: false } };
  }
  inflight ??= (async () => {
    try {
      const raw = await fetchSubmittedProjects();
      const projects = raw.map(normalizeProject).filter((p): p is SubmittedProject => p !== null);
      if (!projects.length) throw new Error("empty list");
      const fetchedAt = new Date().toISOString();
      cache = { at: Date.now(), projects, fetchedAt };
      void saveSnapshot(projects, fetchedAt);
      return { projects, meta: { total: projects.length, fetchedAt, stale: false } };
    } catch (err) {
      console.warn(`[projects] list unavailable: ${err instanceof Error ? err.message : err}`);
      const snap = cache ? { projects: cache.projects, fetchedAt: cache.fetchedAt } : await loadSnapshot();
      if (snap?.projects?.length) return { projects: snap.projects, meta: { total: snap.projects.length, fetchedAt: snap.fetchedAt, stale: true } };
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Roles worth advertising on a card (what a reader can open), in reading order. */
const CARD_ROLES: DocRole[] = ["draft", "concept", "introduction", "needs", "impact", "cost"];

function firstSentences(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return end > 80 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

export async function getProjectListItems(): Promise<{ items: ProjectListItem[]; meta: ProjectCatalogMeta }> {
  const [{ projects, meta }, briefs] = await Promise.all([getSubmittedProjects(), getBriefIndex()]);
  const items = projects.map((p): ProjectListItem => {
    const brief = briefs.get(p.id);
    const roles = new Set(p.documents.filter((d) => d.step === "Өргөн мэдүүлэх").map((d) => roleOf(d)));
    return {
      id: p.id,
      title: p.title,
      type: p.type,
      date: p.date,
      year: p.year,
      initiator: p.initiator?.name ?? null,
      initiatorGroup: p.initiator?.group ?? null,
      coInitiatorCount: p.coInitiatorCount,
      documentCount: p.documents.length,
      categories: CARD_ROLES.filter((r) => roles.has(r)).map((r) => ROLE_LABEL[r]),
      hasBrief: Boolean(brief),
      briefLead: brief ? firstSentences(brief.summary[0]?.text ?? "") : null,
      officialUrl: p.officialUrl,
    };
  });
  return { items, meta };
}

export interface ProjectsOverview {
  total: number;
  withBrief: number;
  /** Most recent projects that have an AI brief (for a homepage entry block). */
  latestWithBrief: ProjectListItem[];
}

/** Small summary for an entry block elsewhere on the site (homepage). Null when the source is unavailable. */
export async function getProjectsOverview(limit = 3): Promise<ProjectsOverview | null> {
  try {
    const { items } = await getProjectListItems();
    const withBrief = items.filter((i) => i.hasBrief).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { total: items.length, withBrief: withBrief.length, latestWithBrief: withBrief.slice(0, Math.max(0, limit)) };
  } catch {
    return null;
  }
}

export interface ProjectDetail {
  project: SubmittedProject;
  /** All initiators: the project's creator first, then the listed team (official d.parliament.mn data). */
  initiators: ProjectInitiator[];
  stale: boolean;
}

const detailCache = new Map<string, { at: number; value: ProjectDetail }>();

/** One project, fresh from the official API (10 min cache), falling back to the cached list. */
export async function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  const hit = detailCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  let project: SubmittedProject | null = null;
  let stale = false;
  try {
    const raw = await fetchProject(id);
    project = raw ? normalizeProject(raw) : null;
    if (!raw) return null;
  } catch {
    const list = await getSubmittedProjects().catch(() => null);
    project = list?.projects.find((p) => p.id === id) ?? null;
    stale = true;
  }
  if (!project) return null;
  const team = await fetchProjectTeam(id).catch(() => []);
  const initiators = [project.initiator, ...team.map(toInitiator)].filter((x): x is ProjectInitiator => x !== null);
  const unique = [...new Map(initiators.map((i) => [i.name, i])).values()];
  const value = { project, initiators: unique, stale };
  if (!stale) detailCache.set(id, { at: Date.now(), value });
  return value;
}
