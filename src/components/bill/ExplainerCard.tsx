import Link from "next/link";
import styles from "./explainer.module.css";
import type { BillExplainer, SourcePassage } from "@/lib/summaries/types";
import { formatDate } from "@/lib/format";
import { appUrl } from "@/lib/site";
import { VideoBlock } from "./VideoBlock";
import { ArrowRight, ArrowUpRight } from "../ui/icons";

interface ExplainerCardProps {
  explainer: BillExplainer;
  /** "bill": on the bill page · "home": homepage feature (adds bill title + link) · "preview": /review */
  variant?: "bill" | "home" | "preview";
  headingId?: string;
}

function Cite({ refs, sources, billUrl }: { refs: string[]; sources: SourcePassage[]; billUrl: string }) {
  const hits = refs.map((r) => sources.find((s) => s.ref === r)).filter((s): s is SourcePassage => Boolean(s));
  if (!hits.length) return null;
  return (
    <span className={styles.cites}>
      {hits.map((s) => (
        <a key={s.ref} href={`${billUrl}#${s.anchor}`} target="_blank" rel="noopener noreferrer" title={s.text.slice(0, 160)}>
          {s.number || "эх"}
          <span className="visually-hidden"> заалт — эх бичвэрт харах (шинэ цонхонд)</span>
        </a>
      ))}
    </span>
  );
}

/**
 * "30 секундэд" explainer: short plain-language summary + who it affects, each statement linked to the
 * clause it comes from. Shown publicly only after human approval (the parent decides).
 */
export function ExplainerCard({ explainer: e, variant = "bill", headingId }: ExplainerCardProps) {
  const hasVideo = Boolean(e.video);
  return (
    <section className={styles.card} data-variant={variant} data-video={hasVideo} aria-labelledby={headingId}>
      {hasVideo ? (
        <div className={styles.media}>
          <VideoBlock video={e.video!} />
        </div>
      ) : null}
      <div className={styles.body}>
        <p className={styles.eyebrow}>
          <span aria-hidden="true" className={styles.clock} />
          30 секундэд
        </p>
        {variant === "home" ? (
          <h2 id={headingId} className={styles.billTitle}>
            {e.billTitle}
          </h2>
        ) : (
          <h2 id={headingId} className="visually-hidden">
            Төслийн товч тайлбар
          </h2>
        )}

        <p className={styles.summary}>
          {e.summary.map((p, i) => (
            <span key={i}>
              {p.text} <Cite refs={p.refs} sources={e.sources} billUrl={e.billUrl} />{" "}
            </span>
          ))}
        </p>

        {e.impact.length ? (
          <div className={styles.impact}>
            <h3>Энэ танд хамаатай юу?</h3>
            <ul>
              {e.impact.map((p, i) => (
                <li key={i}>
                  <span className={styles.who}>{p.who}</span>
                  <span>
                    {p.text} <Cite refs={p.refs} sources={e.sources} billUrl={e.billUrl} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles.foot}>
          <p className={styles.trust}>
            AI-аар ноорог бэлтгэж, хүн хянаж баталсан{e.approvedAt ? ` · ${formatDate(e.approvedAt)}` : ""}. Дугаар дээр дарж эх заалтыг үзнэ үү.
          </p>
          {variant === "home" ? (
            <Link href={appUrl.bill(e.billId)} className={styles.cta}>
              Төслийг үзэх, санал өгөх
              <ArrowRight size={16} />
            </Link>
          ) : (
            <a href={e.billUrl} target="_blank" rel="noopener noreferrer" className={styles.source}>
              Бүтэн эх бичвэр
              <ArrowUpRight size={13} />
              <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
