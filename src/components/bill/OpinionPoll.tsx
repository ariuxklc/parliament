"use client";

import { useEffect, useState } from "react";
import styles from "./opinion.module.css";
import { formatNumber } from "@/lib/format";
import { ArrowUpRight } from "../ui/icons";

type Choice = "support" | "oppose";
interface Totals {
  support: number;
  oppose: number;
  total: number;
  mine: Choice | null;
}

const LABEL: Record<Choice, string> = { support: "Дэмжиж байна", oppose: "Дэмжихгүй байна" };

/**
 * One simple question. Results appear only after voting (so nobody is nudged by the count).
 * Anonymous, one vote per browser, changeable. Clearly not an official submission.
 */
export function OpinionPoll({ billId, officialUrl }: { billId: number; officialUrl: string }) {
  const [data, setData] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/opinion/${billId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Totals) => alive && setData(d))
      .catch(() => alive && setData({ support: 0, oppose: 0, total: 0, mine: null }));
    return () => {
      alive = false;
    };
  }, [billId]);

  const vote = async (choice: Choice) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/opinion/${billId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Алдаа гарлаа");
      setData(d);
      setChanging(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setBusy(false);
    }
  };

  const voted = Boolean(data?.mine) && !changing;
  const pct = (n: number) => (data && data.total ? Math.round((n / data.total) * 100) : 0);

  return (
    <section className={styles.poll} aria-labelledby="opinion-title" aria-busy={!data || busy}>
      <div className={styles.head}>
        <h2 id="opinion-title">Та энэ төслийг дэмжиж байна уу?</h2>
        {!voted ? <p>Нэрээ үлдээх шаардлагагүй. Хариултаа дараа нь өөрчилж болно.</p> : null}
      </div>

      {!voted ? (
        <div className={styles.buttons}>
          {(["support", "oppose"] as Choice[]).map((c) => (
            <button key={c} type="button" className={styles.choice} data-choice={c} disabled={!data || busy} onClick={() => vote(c)} aria-pressed={data?.mine === c}>
              {LABEL[c]}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.result} aria-live="polite">
          <p className={styles.mine}>
            Таны хариулт: <strong>{LABEL[data!.mine!]}</strong>
            <button type="button" className={styles.change} onClick={() => setChanging(true)}>
              Өөрчлөх
            </button>
          </p>
          {/* a proportion bar over a handful of votes would mislead — counts only until there are 10 */}
          {data!.total >= 10 ? (
            <div className={styles.bar} role="img" aria-label={`Дэмжсэн ${data!.support}, дэмжээгүй ${data!.oppose}`}>
              <span style={{ width: `${pct(data!.support)}%` }} />
            </div>
          ) : null}
          <p className={styles.counts}>
            <span>
              <i className={styles.dotSupport} aria-hidden="true" />
              Дэмжсэн <strong className="tabular">{formatNumber(data!.support)}</strong>
              {data!.total >= 10 ? ` (${pct(data!.support)}%)` : ""}
            </span>
            <span>
              <i className={styles.dotOppose} aria-hidden="true" />
              Дэмжээгүй <strong className="tabular">{formatNumber(data!.oppose)}</strong>
              {data!.total >= 10 ? ` (${pct(data!.oppose)}%)` : ""}
            </span>
          </p>
        </div>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <p className={styles.note}>
        Энэ нь энэ сайтын зочдын санал бөгөөд албан ёсны санал болон төлөөллийн судалгаа биш.{" "}
        <a href={officialUrl} target="_blank" rel="noopener noreferrer">
          Албан ёсоор санал өгөх: LawForum
          <ArrowUpRight size={12} />
          <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
        </a>
      </p>
    </section>
  );
}
