"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./legislation.module.css";
import ui from "../../ui/ui.module.css";
import type { ProposalQuery, ProposalsResponse, ProposalSort, ProposalStageFilter } from "@/lib/types";
import { t } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/format";
import { TYPE_SHORT_LABEL } from "@/lib/normalize/proposals";
import { officialUrl } from "@/lib/site";
import { PeriodSelector } from "./PeriodSelector";
import { BillCard } from "./BillCard";
import { EmptyState } from "../../ui/EmptyState";
import { OfficialSourceLink, SourceNote } from "../../ui/OfficialSourceLink";
import { ChevronDown, Search } from "../../ui/icons";

/** Bills shown first, and how many each "show more" adds (kept short so the list stays calm). */
const FIRST = 5;
const STEP = 10;

/** Query → URL params (defaults omitted so shared links stay short). */
function toParams(q: ProposalQuery, defaultYear: number): URLSearchParams {
  const p = new URLSearchParams();
  if (q.year !== defaultYear) p.set("year", String(q.year));
  if (q.session) p.set("session", q.session);
  if (q.stage !== "all") p.set("stage", q.stage);
  if (q.typeId) p.set("type", String(q.typeId));
  if (q.sort !== "newest") p.set("sort", q.sort);
  if (q.q) p.set("q", q.q);
  return p;
}

type Status = "idle" | "loading" | "error";

export function LegislationBrowser({ initial, defaultYear }: { initial: ProposalsResponse; defaultYear: number }) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState<ProposalQuery>(initial.query);
  const [status, setStatus] = useState<Status>("idle");
  const [direction, setDirection] = useState<"past" | "future" | "none">("none");
  const [generation, setGeneration] = useState(0); // bumps when a new period/filter result arrives
  const [search, setSearch] = useState(initial.query.q);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const run = useCallback(
    async (next: ProposalQuery, opts: { append?: boolean } = {}) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setStatus("loading");
      const params = toParams(next, defaultYear);
      // Shareable state without a page reload: /?year=2025&session=2025-fall#huuli
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}#huuli`);
      params.set("limit", String(next.limit));
      if (!params.has("year")) params.set("year", String(next.year));
      try {
        const res = await fetch(`/api/proposals?${params}`, { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as ProposalsResponse;
        setData(json);
        setQuery(json.query);
        setStatus("idle");
        if (!opts.append) setGeneration((g) => g + 1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus("error");
      }
    },
    [defaultYear],
  );

  const update = useCallback(
    (patch: Partial<ProposalQuery>) => {
      const next: ProposalQuery = { ...query, ...patch, limit: FIRST };
      if (patch.year !== undefined && patch.year !== query.year) {
        setDirection(patch.year < query.year ? "past" : "future");
        // keep a session only if it belongs to the new year
        if (patch.session === undefined) next.session = null;
      } else if (patch.session !== undefined) {
        setDirection("none");
      } else {
        setDirection("none");
      }
      setQuery(next);
      void run(next);
    },
    [query, run],
  );

  // debounce free-text search
  useEffect(() => {
    if (search === query.q) return;
    const id = window.setTimeout(() => update({ q: search.trim() }), 320);
    return () => window.clearTimeout(id);
  }, [search, query.q, update]);

  const activeSession = data.sessions.find((s) => s.key === data.query.session) ?? null;
  const yearTotal = data.years.find((y) => y.year === data.query.year)?.count ?? null;
  const periodName = activeSession ? activeSession.label : `${data.query.year} он`;
  const periodRange = activeSession
    ? `${formatDate(activeSession.startDate)}–${activeSession.isOpen ? "өнөөг хүртэл" : formatDate(activeSession.endDate)}`
    : "";

  const typeOptions = useMemo(() => data.period.byType, [data.period.byType]);
  const nearestYear = useMemo(() => {
    const others = data.years.filter((y) => y.year !== data.query.year && y.count > 0);
    return others.sort((a, b) => Math.abs(a.year - data.query.year) - Math.abs(b.year - data.query.year))[0]?.year ?? null;
  }, [data.years, data.query.year]);

  const filtersActive = query.stage !== "all" || query.typeId !== null || query.q !== "";

  return (
    <div className={styles.browser}>
      <PeriodSelector
        years={data.years}
        year={query.year}
        sessions={data.sessions}
        sessionCounts={data.sessionCounts}
        session={query.session}
        yearTotal={yearTotal}
        onYear={(year) => update({ year })}
        onSession={(session) => update({ session })}
      />

      <div className={styles.toolbar}>
        <div className={styles.stageTabs} role="group" aria-label={t.laws.stageLabel}>
          {(
            [
              ["all", t.laws.stageAll, data.period.total],
              ["drafting", t.laws.stageDrafting, data.period.drafting],
              ["submitted", t.laws.stageSubmitted, data.period.submitted],
            ] as [ProposalStageFilter, string, number][]
          ).map(([value, label, count]) => (
            <button key={value} type="button" aria-pressed={query.stage === value} onClick={() => update({ stage: value })} data-stage={value}>
              {label}
              <span className="tabular">{formatNumber(count)}</span>
            </button>
          ))}
        </div>

        <div className={styles.tools}>
          <label className={styles.searchField}>
            <Search size={16} />
            <span className="visually-hidden">{t.laws.searchLabel}</span>
            <input type="search" value={search} placeholder={t.laws.searchPlaceholder} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className={styles.select}>
            <span className="visually-hidden">{t.laws.typeLabel}</span>
            <select value={query.typeId ?? ""} onChange={(e) => update({ typeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t.laws.typeAll}</option>
              {typeOptions.map((o) => (
                <option key={o.typeId} value={o.typeId}>
                  {TYPE_SHORT_LABEL[o.typeId] ?? o.typeTitle} ({o.count})
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <label className={styles.select}>
            <span className="visually-hidden">{t.laws.sortLabel}</span>
            <select value={query.sort} onChange={(e) => update({ sort: e.target.value as ProposalSort })}>
              <option value="newest">{t.laws.sortNewest}</option>
              <option value="oldest">{t.laws.sortOldest}</option>
              <option value="updated">{t.laws.sortUpdated}</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      </div>

      <p aria-live="polite" className={styles.resultLine}>
        <strong>{periodName}</strong>
        {periodRange ? <span>{periodRange}</span> : null}
        <span>
          {formatNumber(data.matched)}
          {filtersActive ? ` / ${formatNumber(data.period.total)}` : ""} төсөл
        </span>
      </p>

      <div ref={resultsRef} className={styles.gridWrap} aria-busy={status === "loading"} data-loading={status === "loading"} data-dir={direction}>
        {status === "error" ? (
          <EmptyState
            title={t.laws.error}
            actions={
              <button type="button" className={`${ui.button} ${ui.buttonBlue}`} onClick={() => run(query)}>
                {t.laws.retry}
              </button>
            }
          />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={t.laws.emptyTitle}
            body={t.laws.emptyBody}
            actions={
              <>
                {filtersActive ? (
                  <button type="button" className={`${ui.button} ${ui.buttonBlue}`} onClick={() => { setSearch(""); update({ stage: "all", typeId: null, q: "" }); }}>
                    {t.laws.emptyReset}
                  </button>
                ) : null}
                {activeSession ? (
                  <button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => update({ session: null })}>
                    {t.laws.wholeYear}
                  </button>
                ) : null}
                {nearestYear ? (
                  <button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => update({ year: nearestYear })}>
                    {t.laws.emptyJump(nearestYear)}
                  </button>
                ) : null}
              </>
            }
          />
        ) : (
          <div key={generation} className={styles.list}>
            {data.items.map((p, i) => (
              <BillCard key={p.id} proposal={p} index={i % STEP} showUpdated={query.sort === "updated"} />
            ))}
          </div>
        )}
      </div>

      {data.items.length > 0 && data.items.length < data.matched ? (
        <div className={styles.more}>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonGhost}`}
            disabled={status === "loading"}
            onClick={() => {
              const next = { ...query, limit: Math.min(96, data.items.length + STEP) };
              setQuery(next);
              void run(next, { append: true });
            }}
          >
            {status === "loading" ? t.laws.loading : t.laws.showMore}
          </button>
          <span>{t.laws.showing(data.items.length, data.matched)}</span>
          {data.items.length >= 96 ? (
            <OfficialSourceLink href={query.stage === "drafting" ? officialUrl.lawforumDrafts() : officialUrl.lawforumProjects()} variant="plain">
              lawforum.parliament.mn
            </OfficialSourceLink>
          ) : null}
        </div>
      ) : null}

      <SourceNote>
        {t.laws.source}
        {data.notes.length ? ` · ${data.notes.join(" ")}` : ""}
      </SourceNote>
    </div>
  );
}
