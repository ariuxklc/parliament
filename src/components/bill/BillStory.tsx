import Link from "next/link";
import styles from "./billStory.module.css";
import { BillJourney } from "./BillJourney";
import { OpinionPoll } from "./OpinionPoll";
import { SummaryPanel } from "./SummaryPanel";
import { VideoBlock } from "./VideoBlock";
import { getExplainer } from "@/lib/summaries/store";
import { findVideo } from "@/lib/summaries/video";
import { getProjectBriefByLawforumId, getProjectIdByLawforumId } from "@/lib/project-summaries/read";
import { ProjectBriefView } from "@/components/projects/ProjectBriefView";
import { ArrowRight } from "../ui/icons";

interface BillLike {
  id: number;
  url: string;
  stage: "drafting" | "submitted";
  publishedDate: string;
}
type BulletinRow = { submittedDate: string | null; snapshotDate: string; stages: { label: string; committeeNote: string; plenaryNote: string }[] } | null;

/*
 * Bill page (/laws/[billId]) reading order, all screen sizes:
 *   10-stage journey → AI brief (full width, expanded) → [phone: opinion question] → chat
 * On desktop the opinion question sits in the right column (<BillSide/>).
 *
 * The brief (agreed with the submitted-projects session, 2026-09-25):
 *   1. its document-based brief, built from the bill's official files (src/lib/project-summaries, cached),
 *      when one exists for this LawForum id — with a link to all official documents on /projects/{id};
 *   2. otherwise the shorter fallback written from the LawForum clause text (src/lib/summaries).
 */

/** Full-width top of the bill page. */
export async function BillStory({ bill, row }: { bill: BillLike; row?: BulletinRow }) {
  const [brief, fallback, video, projectId] = await Promise.all([
    getProjectBriefByLawforumId(bill.id).catch(() => null),
    getExplainer(bill.id).catch(() => null),
    findVideo(bill.id).catch(() => null),
    getProjectIdByLawforumId(bill.id).catch(() => null),
  ]);
  return (
    <>
      <BillJourney bill={bill} row={row} />
      {brief ? (
        <div className={styles.briefSlot} data-video={Boolean(video)}>
          <div className={styles.briefMain}>
            <ProjectBriefView brief={brief} headingLevel={2} title="30 секундын AI тайлбар" />
            <Link href={`/projects/${brief.projectId}`} className={styles.docsLink}>
              Төслийн бүх албан ёсны баримт бичиг
              <ArrowRight size={15} />
            </Link>
          </div>
          {video ? (
            <div className={styles.briefVideo}>
              <VideoBlock video={video} />
            </div>
          ) : null}
        </div>
      ) : (
        <SummaryPanel billId={bill.id} initial={fallback} expanded officialUrl={bill.url} docsHref={projectId ? `/projects/${projectId}` : null} />
      )}
      <div className={styles.mobileOnly}>
        <OpinionPoll billId={bill.id} officialUrl={bill.url} compact />
      </div>
    </>
  );
}

/** Top of the right-hand column (desktop): the opinion question. */
export async function BillSide({ bill }: { bill: BillLike }) {
  return (
    <div className={styles.desktopOnly}>
      <OpinionPoll billId={bill.id} officialUrl={bill.url} compact />
    </div>
  );
}
