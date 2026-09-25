import Link from "next/link";
import styles from "./legislation.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Reveal } from "../../motion/Reveal";
import { LegislationBrowser } from "./LegislationBrowser";
import { ArrowRight } from "../../ui/icons";
import type { Loaded, ProposalsResponse } from "@/lib/types";
import type { ProjectsOverview } from "@/lib/projects/catalog";
import { t } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/format";
import { officialUrl } from "@/lib/site";
import { readableTitle } from "@/lib/text/readable";

interface LegislationSectionProps {
  initial: Loaded<ProposalsResponse>;
  defaultYear: number;
  /** Submitted projects with their official documents (/projects, from Цахим парламент). */
  projects: ProjectsOverview | null;
}

export function LegislationSection({ initial, defaultYear, projects }: LegislationSectionProps) {
  return (
    <section id="huuli" className={styles.section} aria-labelledby="huuli-title">
      <div className="container">
        <SectionHeader
          id="huuli-title"
          title={t.laws.title}
          subtitle={t.laws.subtitle}
          action={<OfficialSourceLink href={officialUrl.lawforumHome()} variant="plain">lawforum.parliament.mn</OfficialSourceLink>}
        />
        <Reveal>
          {initial.ok ? (
            <LegislationBrowser initial={initial.data} defaultYear={defaultYear} />
          ) : (
            <EmptyState title={t.laws.error} body={<OfficialSourceLink href={officialUrl.lawforumHome()} variant="plain">lawforum.parliament.mn</OfficialSourceLink>} />
          )}
        </Reveal>

        {projects && projects.total > 0 ? (
          <Reveal className={styles.projects} index={1}>
            <div className={styles.projectsHead}>
              <h3 id="projects-title">Өргөн мэдүүлсэн төслүүд</h3>
              <p>
                Улсын Их Хуралд өргөн мэдүүлсэн <strong className="tabular">{formatNumber(projects.total)}</strong> төслийн албан ёсны баримт бичиг
                {projects.withBrief ? (
                  <>
                    {" "}· <strong className="tabular">{formatNumber(projects.withBrief)}</strong> нь 30 секундын AI тайлбартай
                  </>
                ) : null}
              </p>
              <Link href="/projects" className={styles.projectsAll}>
                Бүгдийг үзэх
                <ArrowRight size={15} />
              </Link>
            </div>
            {projects.latestWithBrief.length ? (
              <ol className={styles.projectsList} aria-labelledby="projects-title">
                {projects.latestWithBrief.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className={styles.projectRow}>
                      {p.date ? <time dateTime={p.date}>{formatDate(p.date)}</time> : <span />}
                      <span className={styles.projectTitle}>{readableTitle(p.title)}</span>
                      <ArrowRight size={15} className={styles.rowArrow} />
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
