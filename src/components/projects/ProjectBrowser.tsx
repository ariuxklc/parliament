"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./projects.module.css";
import ui from "@/components/ui/ui.module.css";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowRight, Search } from "@/components/ui/icons";
import { formatDate, formatNumber } from "@/lib/format";
import { readableTitle } from "@/lib/text/readable";
import type { InitiatorGroup, ProjectListItem } from "@/lib/projects/types";

/**
 * Browse «Өргөн мэдүүлсэн төслүүд»: search, year, official type, initiator group, AI-brief filter, sort.
 * The ~350 compact rows arrive with the page, so filtering is instant; state is kept in the URL.
 */

export interface BrowserQuery {
  q: string;
  year: number | null;
  type: string | null;
  group: InitiatorGroup | null;
  ai: boolean;
  sort: "newest" | "oldest";
}

const GROUPS: InitiatorGroup[] = ["Засгийн газар", "УИХ-ын гишүүд", "Ерөнхийлөгч", "Бусад"];
const PAGE = 24;

const fold = (s: string) => s.toLocaleLowerCase("mn").replace(/ё/g, "е");

function toParams(q: BrowserQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.year) p.set("year", String(q.year));
  if (q.type) p.set("type", q.type);
  if (q.group) p.set("group", q.group);
  if (q.ai) p.set("ai", "1");
  if (q.sort !== "newest") p.set("sort", q.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function ProjectBrowser({ items, initial }: { items: ProjectListItem[]; initial: BrowserQuery }) {
  const [query, setQuery] = useState(initial);
  const [search, setSearch] = useState(initial.q);
  const [shown, setShown] = useState(PAGE);

  // debounce free text
  useEffect(() => {
    const id = window.setTimeout(() => setQuery((q) => (q.q === search.trim() ? q : { ...q, q: search.trim() })), 200);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${toParams(query)}`);
    setShown(PAGE);
  }, [query]);

  const years = useMemo(() => [...new Set(items.map((i) => i.year).filter((y): y is number => y !== null))].sort((a, b) => b - a), [items]);
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) if (i.type) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const briefCount = useMemo(() => items.filter((i) => i.hasBrief).length, [items]);

  const results = useMemo(() => {
    const needle = fold(query.q);
    const out = items.filter(
      (i) =>
        (!query.year || i.year === query.year) &&
        (!query.type || i.type === query.type) &&
        (!query.group || i.initiatorGroup === query.group) &&
        (!query.ai || i.hasBrief) &&
        (!needle || fold(i.title).includes(needle) || fold(i.initiator ?? "").includes(needle)),
    );
    out.sort((a, b) => (query.sort === "oldest" ? (a.date ?? "").localeCompare(b.date ?? "") : (b.date ?? "").localeCompare(a.date ?? "")));
    return out;
  }, [items, query]);

  const filtered = query.q !== "" || query.year !== null || query.type !== null || query.group !== null || query.ai;
  const update = (patch: Partial<BrowserQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const reset = () => {
    setSearch("");
    setQuery({ q: "", year: null, type: null, group: null, ai: false, sort: "newest" });
  };

  return (
    <div className={styles.browser}>
      <div className={styles.toolbar}>
        <label className={`${styles.field} ${styles.searchField}`}>
          <Search size={16} />
          <span className="visually-hidden">Төслийн нэр, санаачлагчаар хайх</span>
          <input type="search" value={search} placeholder="Төслийн нэр, санаачлагчаар хайх" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className="visually-hidden">Он</span>
          <select value={query.year ?? ""} onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Бүх он</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y} он
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className="visually-hidden">Төрөл</span>
          <select value={query.type ?? ""} onChange={(e) => update({ type: e.target.value || null })}>
            <option value="">Бүх төрөл</option>
            {types.map(([t, n]) => (
              <option key={t} value={t}>
                {t} ({n})
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className="visually-hidden">Санаачлагч</span>
          <select value={query.group ?? ""} onChange={(e) => update({ group: (e.target.value || null) as InitiatorGroup | null })}>
            <option value="">Бүх санаачлагч</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className="visually-hidden">Эрэмбэ</span>
          <select value={query.sort} onChange={(e) => update({ sort: e.target.value as BrowserQuery["sort"] })}>
            <option value="newest">Шинэ нь эхэндээ</option>
            <option value="oldest">Хуучин нь эхэндээ</option>
          </select>
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={query.ai} onChange={(e) => update({ ai: e.target.checked })} />
          <span>
            AI тайлбартай <b>{briefCount}</b>
          </span>
        </label>
      </div>

      <p className={styles.count} aria-live="polite">
        <strong>{formatNumber(results.length)}</strong> төсөл{filtered ? ` / нийт ${formatNumber(items.length)}` : ""}
        {filtered ? (
          <button type="button" onClick={reset} className={styles.reset}>
            Шүүлтүүрийг арилгах
          </button>
        ) : null}
      </p>

      {results.length === 0 ? (
        <EmptyState
          title="Хайлтад тохирох төсөл олдсонгүй"
          body="Өөр үг, он эсвэл төрлөөр хайж үзнэ үү."
          actions={
            <button type="button" className={`${ui.button} ${ui.buttonBlue}`} onClick={reset}>
              Бүх төслийг харах
            </button>
          }
        />
      ) : (
        <ol className={styles.list}>
          {results.slice(0, shown).map((p) => (
            <li key={p.id} className={styles.card} data-brief={p.hasBrief}>
              <h2 className={styles.cardTitle}>
                <Link href={`/projects/${p.id}`} title={p.title}>
                  {readableTitle(p.title)}
                </Link>
              </h2>
              <p className={styles.cardMeta}>
                {p.date ? <time dateTime={p.date}>{formatDate(p.date)}</time> : null}
                {p.type ? <span>{p.type}</span> : null}
                {p.initiator ? (
                  <span>
                    {p.initiator}
                    {p.coInitiatorCount ? ` +${p.coInitiatorCount}` : ""}
                  </span>
                ) : null}
                {p.hasBrief ? <span className={styles.aiTag}>30 секундын AI тайлбар</span> : null}
              </p>
              <ArrowRight size={16} className={styles.cardArrow} />
            </li>
          ))}
        </ol>
      )}

      {results.length > shown ? (
        <div className={styles.more}>
          <button type="button" className={`${ui.button} ${ui.buttonBlue}`} onClick={() => setShown((n) => n + PAGE)}>
            Цааш үзэх ({formatNumber(results.length - shown)})
          </button>
        </div>
      ) : null}
    </div>
  );
}
