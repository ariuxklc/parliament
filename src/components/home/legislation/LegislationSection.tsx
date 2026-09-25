import styles from "./legislation.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Reveal } from "../../motion/Reveal";
import { LegislationBrowser } from "./LegislationBrowser";
import { ProjectsSpotlight } from "../../projects/ProjectsSpotlight";
import type { Loaded, ProposalsResponse } from "@/lib/types";
import type { ProjectsOverview } from "@/lib/projects/catalog";
import { t } from "@/lib/i18n";
import { officialUrl } from "@/lib/site";

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

        {/* Gateway to the submitted projects' official documents and 30-second AI explanations. */}
        {projects && projects.total > 0 ? (
          <Reveal>
            <ProjectsSpotlight projects={projects} />
          </Reveal>
        ) : null}

        <Reveal index={1}>
          {initial.ok ? (
            <LegislationBrowser initial={initial.data} defaultYear={defaultYear} />
          ) : (
            <EmptyState title={t.laws.error} body={<OfficialSourceLink href={officialUrl.lawforumHome()} variant="plain">lawforum.parliament.mn</OfficialSourceLink>} />
          )}
        </Reveal>
      </div>
    </section>
  );
}
