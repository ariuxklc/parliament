import "server-only";
import { listBriefs, readBrief, readLinks } from "./store.ts";
import type { ProjectBrief } from "./types.ts";

/**
 * Cached reads for pages. Never generates, never touches the network — briefs are written offline by
 * scripts/process-projects.ts. Also used by /laws/{id} (homepage/design session) to show the document
 * brief under the Bill Journey when the LawForum record is linked to a processed project.
 */

let index: { at: number; byProject: Map<string, ProjectBrief>; byLawforum: Map<number, string> } | null = null;
const INDEX_TTL = 60_000;

async function getIndex() {
  if (index && Date.now() - index.at < INDEX_TTL) return index;
  const [briefs, links] = await Promise.all([listBriefs(), readLinks()]);
  const byProject = new Map(briefs.map((b) => [b.projectId, b]));
  const byLawforum = new Map<number, string>();
  for (const [projectId, link] of Object.entries(links)) if (link.lawforumId) byLawforum.set(link.lawforumId, projectId);
  for (const b of briefs) if (b.lawforumId) byLawforum.set(b.lawforumId, b.projectId);
  index = { at: Date.now(), byProject, byLawforum };
  return index;
}

export async function getProjectBrief(projectId: string): Promise<ProjectBrief | null> {
  return readBrief(projectId).catch(() => null);
}

/** All cached briefs keyed by project id (listing page). */
export async function getBriefIndex(): Promise<Map<string, ProjectBrief>> {
  return (await getIndex().catch(() => null))?.byProject ?? new Map();
}

/** d.parliament project id for a LawForum record, when the link was verified by shared official file ids. */
export async function getProjectIdByLawforumId(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await getIndex().catch(() => null))?.byLawforum.get(id) ?? null;
}

export async function getProjectBriefByLawforumId(id: number): Promise<ProjectBrief | null> {
  const projectId = await getProjectIdByLawforumId(id);
  return projectId ? getProjectBrief(projectId) : null;
}
