"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./summaryPanel.module.css";
import type { BillExplainer, SourcePassage } from "@/lib/summaries/types";
import { formatDate } from "@/lib/format";
import { VideoBlock } from "./VideoBlock";
import { ArrowUpRight, ChevronDown } from "../ui/icons";

function Cites({ refs, sources, billUrl }: { refs: string[]; sources: SourcePassage[]; billUrl: string }) {
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

type State = { kind: "ready"; e: BillExplainer } | { kind: "loading" } | { kind: "error"; message: string };

/**
 * AI summary box for the bill page, used when the bill has no document-based brief. The summary
 * sentences show by default; "Дэлгэрэнгүй" opens "Энэ танд хамаатай юу?" and the full-text link in place
 * (native <details>, the same pattern as the brief). If no summary exists yet it is written on the spot
 * (~6–10 s) and cached. Every statement links to its clause; the label says it is AI-generated.
 */
interface SummaryPanelProps {
  billId: number;
  initial: BillExplainer | null;
  expanded?: boolean;
  /** Official LawForum record — offered when no summary can be written. */
  officialUrl?: string;
  /** All official documents on /projects/{id}, when the bill is linked there. */
  docsHref?: string | null;
}

export function SummaryPanel({ billId, initial, expanded = false, officialUrl, docsHref }: SummaryPanelProps) {
  const [state, setState] = useState<State>(initial ? { kind: "ready", e: initial } : { kind: "loading" });
  const [open, setOpen] = useState(expanded);
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const bodyId = `${id}-body`;

  useEffect(() => {
    if (initial) return;
    // The panel is rendered for both desktop and phone layouts; only the visible one asks for a summary.
    if (!ref.current || ref.current.offsetParent === null) return;
    let alive = true;
    fetch(`/api/bills/${billId}/summary`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "AI тайлбар бэлтгэж чадсангүй.");
        return d as BillExplainer;
      })
      .then((e) => alive && setState({ kind: "ready", e }))
      .catch((err: Error) => alive && setState({ kind: "error", message: err.message }));
    return () => {
      alive = false;
    };
  }, [billId, initial]);

  const e = state.kind === "ready" ? state.e : null;
  const reviewed = e?.status === "approved";

  return (
    <section
      ref={ref}
      className={styles.panel}
      aria-labelledby={`${id}-title`}
      aria-busy={state.kind === "loading"}
      data-open={open}
      data-layout={expanded ? "wide" : "compact"}
      data-video={Boolean(e?.video)}
    >
      {e?.video ? (
        <div className={styles.video}>
          <VideoBlock video={e.video} />
        </div>
      ) : null}

      <div className={styles.head}>
        <h2 id={`${id}-title`}>30 секундын AI тайлбар</h2>
        {e ? (
          <span className={styles.badge} data-reviewed={reviewed}>
            {reviewed ? "Хүн хянасан" : "AI · хүн хянаагүй"}
          </span>
        ) : null}
      </div>

      {state.kind === "loading" ? (
        <div className={styles.loading} role="status">
          <span className={styles.line} />
          <span className={styles.line} />
          <span className={styles.lineShort} />
          <span className={styles.loadingText}>Албан ёсны эх бичвэрээс тайлбар бэлтгэж байна…</span>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className={styles.errorBox}>
          <p className={styles.error}>{state.message}</p>
          {docsHref || officialUrl ? (
            <p className={styles.errorLinks}>
              {docsHref ? <a href={docsHref}>Албан ёсны баримт бичгүүдийг үзэх →</a> : null}
              {officialUrl ? (
                <a href={officialUrl} target="_blank" rel="noopener noreferrer">
                  LawForum дээр үзэх
                  <ArrowUpRight size={12} />
                  <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {e ? (
        <>
          <div id={bodyId} className={styles.body}>
            <p className={styles.summary}>
              {e.summary.map((p, i) => (
                <span key={i}>
                  {p.text} {open ? <Cites refs={p.refs} sources={e.sources} billUrl={e.billUrl} /> : null}{" "}
                </span>
              ))}
            </p>

            {expanded ? (
              <>
                <details className={styles.more}>
                  <summary>
                    <span className={`${styles.moreLabel} ${styles.whenClosed}`}>Дэлгэрэнгүй</span>
                    <span className={`${styles.moreLabel} ${styles.whenOpen}`}>Хураах</span>
                    <span className={styles.moreHint}>{e.impact.length ? "Энэ танд хамаатай юу? · эх бичвэр" : "эх бичвэр"}</span>
                    <ChevronDown size={16} />
                  </summary>
                  <div className={styles.moreBody}>
                    {e.impact.length ? (
                      <div className={styles.impact}>
                        <h3>Энэ танд хамаатай юу?</h3>
                        <ul>
                          {e.impact.map((p, i) => (
                            <li key={i}>
                              <span className={styles.who}>{p.who}</span>
                              <span>
                                {p.text} <Cites refs={p.refs} sources={e.sources} billUrl={e.billUrl} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <a href={e.billUrl} target="_blank" rel="noopener noreferrer" className={styles.source}>
                      Бүтэн эх бичвэр
                      <ArrowUpRight size={13} />
                      <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
                    </a>
                  </div>
                </details>
                <p className={styles.trust}>
                  {reviewed ? `AI-аар бэлтгэж, хүн хянасан${e.approvedAt ? ` (${formatDate(e.approvedAt)})` : ""}` : "AI-аар бэлтгэсэн · алдаа байж болно"} ·
                  дугаар дээр дарж эх заалтыг шалгана уу
                </p>
              </>
            ) : open ? (
              <>
                {e.impact.length ? (
                  <div className={styles.impact}>
                    <h3>Энэ танд хамаатай юу?</h3>
                    <ul>
                      {e.impact.map((p, i) => (
                        <li key={i}>
                          <span className={styles.who}>{p.who}</span>
                          <span>
                            {p.text} <Cites refs={p.refs} sources={e.sources} billUrl={e.billUrl} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <a href={e.billUrl} target="_blank" rel="noopener noreferrer" className={styles.source}>
                  Бүтэн эх бичвэр
                  <ArrowUpRight size={13} />
                  <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
                </a>
                <p className={styles.trust}>
                  {reviewed
                    ? `AI-аар бэлтгэж, хүн хянасан${e.approvedAt ? ` (${formatDate(e.approvedAt)})` : ""}.`
                    : "AI-аар автоматаар бэлтгэсэн тул алдаа байж болно."}{" "}
                  Дугаар дээр дарж эх заалтыг шалгана уу. Албан ёсны эх бичвэр л хүчинтэй.
                </p>
              </>
            ) : null}
          </div>

          {expanded ? null : (
            <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
              {open ? "Хураах" : e.impact.length ? "Дэлгэрэнгүй · Энэ танд хамаатай юу?" : "Дэлгэрэнгүй"}
              <ChevronDown size={15} />
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}
