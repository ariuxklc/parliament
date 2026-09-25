import Image from "next/image";
import styles from "./news.module.css";
import { SectionHeader } from "../../ui/SectionHeader";
import { OfficialSourceLink } from "../../ui/OfficialSourceLink";
import { EmptyState } from "../../ui/EmptyState";
import { Reveal } from "../../motion/Reveal";
import { Parallax } from "../../motion/Parallax";
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

/** One lead story (the official featured item) and four more. Every item links to its page on new.parliament.mn. */
export function NewsSection({ news }: { news: Loaded<NewsItem[]> }) {
  const items = news.ok ? news.data : [];
  const featured = items.filter((n) => n.featured);
  const lead = featured[0] ?? items[0];
  const rest = items
    .filter((n) => n.id !== lead?.id)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 4);

  return (
    <section id="medee" className={styles.section} aria-labelledby="medee-title">
      <div className="container">
        <SectionHeader id="medee-title" title={t.news.title} action={<OfficialSourceLink href={officialUrl.newsList()} variant="plain">{t.news.all}</OfficialSourceLink>} />
        {!lead ? (
          <EmptyState title={t.news.none} />
        ) : (
          <div className={styles.top}>
            <Reveal as="article" className={styles.lead}>
              <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.leadLink}>
                <div className={styles.leadMedia}>
                  {lead.cover ? (
                    <Parallax speed={0.06} max={28} className={styles.leadParallax} aria-hidden>
                      <Image src={lead.cover} alt="" fill sizes="(max-width: 980px) 100vw, 60vw" className={styles.leadImg} />
                    </Parallax>
                  ) : null}
                </div>
                <Meta item={lead} />
                <h3 className={styles.leadTitle}>{lead.title}</h3>
                {lead.excerpt ? <p className={styles.excerpt}>{lead.excerpt}</p> : null}
                <span className="visually-hidden">{t.common.opensInNewTab}</span>
              </a>
            </Reveal>

            <ul className={styles.secondary}>
              {rest.map((n, i) => (
                <Reveal as="li" key={n.id} index={i + 1}>
                  <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.item}>
                    <div className={styles.itemBody}>
                      <Meta item={n} />
                      <h3 className={styles.itemTitle}>{n.title}</h3>
                    </div>
                    <div className={styles.thumb}>{n.cover ? <Image src={n.cover} alt="" fill sizes="140px" className={styles.thumbImg} /> : null}</div>
                    <span className="visually-hidden">{t.common.opensInNewTab}</span>
                  </a>
                </Reveal>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
