import "server-only";
import { findLawForumMatch } from "./lawforum-link.ts";
import type { SubmittedProject } from "./types.ts";
import { readLinks, writeLink } from "../project-summaries/store.ts";

/**
 * Verified LawForum id for a project (see lawforum-link.ts). Reads data/project-links.json; when a project
 * has never been checked, the check runs in the background (≈1 LawForum page) and is saved for next time,
 * so a first page view never waits on it.
 */

const running = new Set<string>();

export async function lawforumIdFor(project: SubmittedProject): Promise<number | null> {
  const links = await readLinks().catch(() => ({}) as Awaited<ReturnType<typeof readLinks>>);
  const known = links[project.id];
  if (known) return known.lawforumId;
  if (!running.has(project.id)) {
    running.add(project.id);
    void findLawForumMatch(project)
      .then((m) => writeLink(project.id, { ...m, checkedAt: new Date().toISOString() }))
      .catch(() => undefined)
      .finally(() => running.delete(project.id));
  }
  return null;
}
