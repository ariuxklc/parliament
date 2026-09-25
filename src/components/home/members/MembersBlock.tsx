import styles from "./members.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Parallax } from "../../motion/Parallax";
import { Reveal } from "../../motion/Reveal";
import { MemberSection } from "./MemberSection";
import type { Loaded, MemberRoster } from "@/lib/types";
import { t } from "@/lib/i18n";
import { officialUrl } from "@/lib/site";

export function MembersBlock({ roster }: { roster: Loaded<MemberRoster> }) {
  return (
    <section id="gishuud" className={styles.section} aria-labelledby="gishuud-title">
      {/* soft depth layer: the emblem watermark drifts slower than the roster */}
      <Parallax speed={0.14} max={110} className={styles.watermark} aria-hidden>
        <span />
      </Parallax>
      <div className="container">
        <SectionHeader
          id="gishuud-title"
          tone="dark"
          title={t.members.title}
          subtitle={t.members.subtitle}
          action={
            <OfficialSourceLink href={officialUrl.memberList()} tone="dark">
              {t.members.allOfficial}
            </OfficialSourceLink>
          }
        />
        <Reveal>
          {roster.ok ? <MemberSection roster={roster.data} /> : <EmptyState title={t.common.unavailable} />}
        </Reveal>
      </div>
    </section>
  );
}
