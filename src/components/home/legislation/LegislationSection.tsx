import styles from "./legislation.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Reveal } from "../../motion/Reveal";
import { LegislationBrowser } from "./LegislationBrowser";
import type { Loaded, ProposalsResponse } from "@/lib/types";
import { t } from "@/lib/i18n";
import { officialUrl } from "@/lib/site";

export function LegislationSection({ initial, defaultYear }: { initial: Loaded<ProposalsResponse>; defaultYear: number }) {
  return (
    <section id="huuli" className={styles.section} aria-labelledby="huuli-title">
      <div className="container">
        <SectionHeader
          id="huuli-title"
          title={t.laws.title}
          subtitle={t.laws.subtitle}
          action={<OfficialSourceLink href={officialUrl.lawforumHome()}>lawforum.parliament.mn</OfficialSourceLink>}
        />
        <Reveal>
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
