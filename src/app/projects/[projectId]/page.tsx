import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { BillJourney } from "@/components/bill/BillJourney";
import { OpinionPoll } from "@/components/bill/OpinionPoll";
import { ProjectBriefView } from "@/components/projects/ProjectBriefView";
import { OfficialDocuments } from "@/components/projects/OfficialDocuments";
import styles from "@/components/projects/projects.module.css";
import { getNavigation } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/format";
import { getProjectDetail } from "@/lib/projects/catalog";
import { projectJourney } from "@/lib/projects/journey";
import { lawforumIdFor } from "@/lib/projects/links";
import { isProjectId, LAWFORUM_ORIGIN } from "@/lib/projects/normalize";
import { getProjectBrief } from "@/lib/project-summaries/read";
import { readableTitle } from "@/lib/text/readable";
import type { ProjectBrief } from "@/lib/project-summaries/types";
import type { SubmittedProject } from "@/lib/projects/types";

type Params = Promise<{ projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { projectId } = await params;
  const detail = isProjectId(projectId) ? await getProjectDetail(projectId).catch(() => null) : null;
  return { title: detail ? `${readableTitle(detail.project.title)} — Өргөн мэдүүлсэн төсөл` : "Өргөн мэдүүлсэн төсөл" };
}

/** A brief is out of date when a file it read is gone, or a new submission-package file appeared. */
function isOutdated(brief: ProjectBrief, project: SubmittedProject): boolean {
  const live = new Set(project.documents.map((d) => d.fileId));
  const known = new Set(brief.documentFileIds);
  if (brief.sources.some((s) => !live.has(s.fileId))) return true;
  return project.documents.some((d) => d.step === "Өргөн мэдүүлэх" && !known.has(d.fileId));
}

export default async function ProjectPage({ params }: { params: Params }) {
  const { projectId } = await params;
  if (!isProjectId(projectId)) notFound();
  const detail = await getProjectDetail(projectId).catch(() => null);
  if (!detail) notFound();
  const { project, initiators, stale } = detail;

  const [nav, brief, journey, lawforumId] = await Promise.all([
    getNavigation(),
    getProjectBrief(project.id),
    projectJourney(project).catch(() => null),
    lawforumIdFor(project).catch(() => null),
  ]);
  const now = new Date();

  // Same page design as /laws/{id}: header → journey → AI box (full width) → main column + 320px aside.
  // The main column holds the official documents where /laws has its chat.
  return (
    <>
      <SiteHeader nav={nav} />
      <main id="main" className={`container ${styles.page}`}>
        <nav className={styles.crumbs} aria-label="Байршил">
          <Link href="/">Нүүр хуудас</Link>
          <span aria-hidden="true">/</span>
          <Link href="/projects">Өргөн мэдүүлсэн төслүүд</Link>
          <span aria-hidden="true">/</span>
          <span>Төсөл</span>
        </nav>
        <p className={styles.eyebrow}>{project.type ?? "Төсөл"}</p>
        <h1 className={styles.title} title={project.title}>
          {readableTitle(project.title)}
        </h1>
        {/* Two quiet lines, same pattern as the /laws/{id} header. */}
        <p className={styles.metaLine}>
          <span className={styles.stage} title="Цахим парламентын «Өргөн мэдүүлсэн төслүүд» жагсаалтад бүртгэлтэй">
            <span className={styles.dot} aria-hidden="true" />
            Өргөн мэдүүлсэн
          </span>
          {project.date ? (
            <time dateTime={project.date} title="Цахим парламентад тэмдэглэсэн огноо; албан ёсоор өргөн мэдүүлсэн огнооноос 1–2 хоног зөрж болно.">
              {formatDate(project.date)}
            </time>
          ) : null}
          <a href={project.officialUrl} target="_blank" rel="noopener noreferrer">
            Цахим парламент ↗<span className="visually-hidden"> (шинэ цонхонд)</span>
          </a>
          {lawforumId ? (
            <a href={`${LAWFORUM_ORIGIN}/project/${lawforumId}/`} target="_blank" rel="noopener noreferrer">
              Эх бичвэр ↗<span className="visually-hidden"> (LawForum, шинэ цонхонд)</span>
            </a>
          ) : null}
          {lawforumId ? <Link href={`/laws/${lawforumId}`}>Хуулийн төслийн хуудас</Link> : null}
        </p>
        {initiators.length ? (
          <p className={`${styles.metaLine} ${styles.metaLineSmall}`}>
            <span>
              Санаачлагч: {initiators.slice(0, 3).map((i) => i.name).join(", ")}
              {initiators.length > 3 ? ` ба бусад ${initiators.length - 3}` : ""}
            </span>
            {project.initiator?.group ? <span>{project.initiator.group}</span> : null}
          </p>
        ) : null}
        {stale ? (
          <p className={styles.staleNote} role="note">
            Цахим парламенттай холбогдож чадсангүй — сүүлд хадгалсан мэдээллийг харуулж байна.
          </p>
        ) : null}

        {journey ? (
          <BillJourney bill={{ stage: "submitted", publishedDate: project.date ?? "" }} model={journey.model} sourceNote={journey.sourceNote} />
        ) : null}
        {brief ? (
          <ProjectBriefView brief={brief} headingLevel={2} title="30 секундын AI тайлбар" outdated={isOutdated(brief, project)} />
        ) : (
          <section className={styles.pending} aria-labelledby="brief-pending">
            <h2 id="brief-pending">30 секундын AI тайлбар бэлэн биш</h2>
            <p>Албан ёсны файлуудыг доороос шууд нээж болно.</p>
          </section>
        )}

        <div className={styles.layout} data-single={!lawforumId}>
          <OfficialDocuments documents={project.documents} brief={brief} />

          {/* Same question as on /laws/{id}; votes are keyed by the LawForum id, so both pages share them. */}
          {lawforumId ? (
            <aside className={styles.aside} aria-label="Иргэдийн санал">
              <OpinionPoll billId={lawforumId} officialUrl={`${LAWFORUM_ORIGIN}/project/${lawforumId}/`} compact />
            </aside>
          ) : null}
        </div>
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
