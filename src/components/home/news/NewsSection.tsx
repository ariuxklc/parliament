import Image from "next/image";
import styles from "./news.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Reveal } from "../../motion/Reveal";
import { Parallax } from "../../motion/Parallax";
import { ArrowUpRight } from "../../ui/icons";
import type { Loaded, NewsItem } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate, formatTime } from "@/lib/format";
import { officialUrl } from "@/lib/site";

function Meta({ item }: { item: NewsItem }) {
  return (
    <p className={styles.meta}>
      {item.category ? <span className={styles.category}>{item.category}</span> : null}
      <time dateTime={item.publishedAt}>
        {formatDate(item.publishedAt)} · {formatTime(item.publishedAt)}
      </time>
    </p>
  );
}

/**
 * One lead story (official featured item), four secondary featured items, then the latest
 * articles as a compact timeline. Every item links to its page on new.parliament.mn.
 */
export function NewsSection({ news }: { news: Loaded<NewsItem[]> }) {
  const items = news.ok ? news.data : [];
  const featured = items.filter((n) => n.featured);
  const lead = featured[0] ?? items[0];
  const secondary = (featured.length ? featured.slice(1) : items.slice(1)).slice(0, 4);
  const used = new Set([lead?.id, ...secondary.map((s) => s.id)]);
  const latest = items.filter((n) => !used.has(n.id)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 4);

  return (
    <section id="medee" className={styles.section} aria-labelledby="medee-title">
      <div className="container">
        <SectionHeader id="medee-title" title={t.news.title} action={<OfficialSourceLink href={officialUrl.newsList()}>{t.news.all}</OfficialSourceLink>} />
        {!lead ? (
          <EmptyState title={t.news.none} />
        ) : (
          <>
            <div className={styles.top}>
              <Reveal as="article" className={styles.lead}>
                <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.leadLink}>
                  <div className={styles.leadMedia}>
                    {lead.cover ? (
                      <Parallax speed={0.08} max={36} className={styles.leadParallax} aria-hidden>
                        <Image src={lead.cover} alt="" fill sizes="(max-width: 980px) 100vw, 60vw" className={styles.leadImg} />
                      </Parallax>
                    ) : null}
                  </div>
                  <div className={styles.leadBody}>
                    <Meta item={lead} />
                    <h3 className={styles.leadTitle}>{lead.title}</h3>
                    {lead.excerpt ? <p className={styles.excerpt}>{lead.excerpt}</p> : null}
                    <span className={styles.readMore}>
                      {t.news.readMore}
                      <ArrowUpRight size={14} />
                      <span className="visually-hidden">{t.common.opensInNewTab}</span>
                    </span>
                  </div>
                </a>
              </Reveal>

              <ul className={styles.secondary}>
                {secondary.map((n, i) => (
                  <Reveal as="li" key={n.id} index={i + 1}>
                    <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.item}>
                      <div className={styles.thumb}>{n.cover ? <Image src={n.cover} alt="" fill sizes="160px" className={styles.thumbImg} /> : null}</div>
                      <div className={styles.itemBody}>
                        <Meta item={n} />
                        <h3 className={styles.itemTitle}>{n.title}</h3>
                      </div>
                      <span className="visually-hidden">{t.common.opensInNewTab}</span>
                    </a>
                  </Reveal>
                ))}
              </ul>
            </div>

            {latest.length ? (
              <div className={styles.latestWrap}>
                <h3 className={styles.latestHead}>{t.news.latest}</h3>
                <ol className={styles.latest}>
                  {latest.map((n, i) => (
                    <Reveal as="li" key={n.id} index={i}>
                      <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.latestItem}>
                        <Meta item={n} />
                        <p className={styles.latestTitle}>{n.title}</p>
                        <span className="visually-hidden">{t.common.opensInNewTab}</span>
                      </a>
                    </Reveal>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
