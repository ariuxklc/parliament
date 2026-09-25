import Link from "next/link";
import styles from "./spotlight.module.css";
import { ArrowRight } from "@/components/ui/icons";
import { formatDate, formatNumber } from "@/lib/format";
import { readableTitle } from "@/lib/text/readable";
import type { ProjectsOverview } from "@/lib/projects/catalog";

/**
 * Homepage gateway to «Өргөн мэдүүлсэн төслүүд» — the official documents of every submitted project, with
 * 30-second AI explanations. A calm white card with the traditional key-pattern edge in soft blue, three
 * official figures (all counted from d.parliament.mn's own list) and the newest explained projects.
 * Prominent through space and scale rather than a saturated colour block. Server-safe.
 */
export function ProjectsSpotlight({ projects }: { projects: ProjectsOverview }) {
  return (
    <section className={styles.spotlight} aria-labelledby="projects-spotlight-title">
      <div className="meander" data-tone="blue" aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Өргөн мэдүүлсэн төслүүд</p>
          <h3 id="projects-spotlight-title" className={styles.title}>
            Төсөл бүрийн албан ёсны баримт бичиг — нэг дор, ойлгомжтой
          </h3>
          <dl className={styles.figures}>
            <div>
              <dt>өргөн мэдүүлсэн төсөл</dt>
              <dd className="tabular">{formatNumber(projects.total)}</dd>
            </div>
            {projects.documents ? (
              <div>
                <dt>албан ёсны файл</dt>
                <dd className="tabular">{formatNumber(projects.documents)}</dd>
              </div>
            ) : null}
            {projects.withBrief ? (
              <div>
                <dt>30 секундын AI тайлбар</dt>
                <dd className="tabular">{formatNumber(projects.withBrief)}</dd>
              </div>
            ) : null}
          </dl>
          <Link href="/projects" className={styles.cta}>
            Бүх төслийг үзэх
            <ArrowRight size={16} />
          </Link>
        </div>

        {projects.latestWithBrief.length ? (
          <div className={styles.latest}>
            <p className={styles.latestLabel}>Сүүлд тайлбарласан</p>
            <ol>
              {projects.latestWithBrief.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className={styles.item} title={p.title}>
                    {p.date ? <time dateTime={p.date}>{formatDate(p.date)}</time> : <span />}
                    <span className={styles.itemTitle}>{readableTitle(p.title)}</span>
                    <ArrowRight size={16} className={styles.itemArrow} />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
