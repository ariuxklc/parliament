import type { LawArticle } from "../parliament/legalinfo.ts";
import { amendmentHistory, changesIn } from "../parliament/legalinfo.ts";
import type { BillRecord, BulletinBill, MemberRecord, ParliamentData, PollRecord } from "../parliament/records.ts";
import { annotateSpelledAmounts, expandTopics, normalize, passageHits, similar, stem, titleMatch, tokens, topicTokens } from "../parliament/text.ts";
import { linkBulletin, linkLawForum, stageListing, titleScore } from "../parliament/bills.ts";
import type { SourceRegistry } from "./sources.ts";
import { findHelpServices } from "./help-directory.ts";

/**
 * Read-only tools the assistant can call. Each one queries a fixed official endpoint through the
 * server's data layer, validates its arguments, registers every record it returns (so the model can cite
 * it as [S#]) and returns compact JSON. No tool accepts a URL, touches credentials or writes anything.
 */

export type ToolContext = { data: ParliamentData; sources: SourceRegistry; today: string };

type Args = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  label(args: Args): string;
  run(args: Args, ctx: ToolContext): Promise<unknown>;
}

/* ------------------------------------------------------------ argument helpers */

function str(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function optStr(value: unknown, max = 120): string | null {
  return str(value, max) || null;
}
function dateArg(value: unknown): string | null {
  const v = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}
function intArg(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function enumArg<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
/** Official text as the model sees it: verbatim, with digits added next to spelled-out amounts. */
const official = (text: string, max: number) => clip(annotateSpelledAmounts(text), max);
const nullable = (type: string) => ({ type: [type, "null"] });

/** Query words for matching: topic words (inflection-aware) plus a few related words. */
function queryWords(query: string): string[] {
  const topics = topicTokens(query);
  return topics.length ? expandTopics(topics) : tokens(query).filter((t) => t.length >= 3);
}

/* -------------------------------------------------------------------- laws */

const ACT_TYPES = { any: "", law: "27", parliament_resolution: "28", constitution: "26", government_resolution: "33", treaty: "29" } as const;

const searchLaws: ToolDef = {
  name: "search_laws",
  description:
    "Search Mongolian legal acts in the official Unified Legal Information System (legalinfo.mn): laws in force, Parliament resolutions, the Constitution, government resolutions, treaties. " +
    "mode 'title' matches act titles — use it for a law by name ('Зөрчлийн тухай') or its amendment acts ('Зөрчлийн тухай хуульд нэмэлт'). " +
    "mode 'text' searches inside the texts and returns matching snippets — use it for a topic or situation ('мопед', 'хамгаалалтын малгай', 'цалингийн доод хэмжээ') and to find related or similar laws. " +
    "adopted_from/adopted_to (YYYY-MM-DD) filter by adoption date; to list everything adopted around a date use query 'тухай' with mode 'title'. Queries must be in Mongolian.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["query", "mode", "act_type", "in_force_only", "adopted_from", "adopted_to"],
    properties: {
      query: { type: "string", description: "Mongolian words to search for." },
      mode: { type: "string", enum: ["title", "text"] },
      act_type: { type: "string", enum: Object.keys(ACT_TYPES) },
      in_force_only: { type: "boolean", description: "true = only acts currently in force." },
      adopted_from: nullable("string"),
      adopted_to: nullable("string"),
    },
  },
  label: (a) => `Холбогдох хуулийг хайж байна: «${str(a.query, 60)}»`,
  async run(a, ctx) {
    const query = str(a.query, 120);
    if (!query) return { error: "query хоосон байна." };
    const mode = enumArg(a.mode, ["title", "text"] as const, "title");
    const actType = enumArg(a.act_type, Object.keys(ACT_TYPES) as (keyof typeof ACT_TYPES)[], "any");
    const hits = await ctx.data.lawSearch({
      query,
      mode,
      category: ACT_TYPES[actType],
      inForceOnly: a.in_force_only === true,
      adoptedFrom: dateArg(a.adopted_from) ?? undefined,
      adoptedTo: dateArg(a.adopted_to) ?? undefined,
    });
    return {
      total_found: hits.length,
      results: hits.slice(0, 14).map((h) => ({
        ref: ctx.sources.add({ title: `${h.title} (${h.actType})`, url: `https://legalinfo.mn/mn/detail?lawId=${h.lawId}`, publisher: "legalinfo.mn" }),
        law_id: h.lawId,
        title: h.title,
        act_type: h.actType,
        adopted: h.adopted,
        in_effect_from: h.effective,
        ...(h.snippet ? { snippet: official(h.snippet, 340) } : {}),
      })),
      note: hits.length > 14 ? `Нийт ${hits.length} илэрц; эхний 14-ийг харуулав. Илүү нарийн хайлт хийж болно.` : undefined,
    };
  },
};

function articleExcerpt(article: LawArticle, words: string[], budget: number): string {
  const matching = words.length ? article.paragraphs.filter((p) => passageHits(words, p) > 0) : [];
  const chosen = matching.length ? matching : article.paragraphs;
  let text = article.heading;
  for (const raw of chosen) {
    const p = annotateSpelledAmounts(raw);
    if (text.length + p.length + 1 > budget) {
      text += "\n…";
      break;
    }
    text += `\n${p}`;
  }
  return text;
}

const readLaw: ToolDef = {
  name: "read_law",
  description:
    "Read an act's official consolidated text on legalinfo.mn by law_id (from search_laws). Pass query words to get the most relevant articles, or an article number (e.g. '14.7'). " +
    "Always returns amendment_history (dates on which parts were changed by later laws). Pass changed_in ('2026', '2025-07' or '2025-07-09') to get exactly what changed then: " +
    "each change's article, kind (added / amended / repealed) and the resulting wording — use this to explain how a law changed across years.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["law_id", "query", "article", "changed_in"],
    properties: {
      law_id: { type: "string" },
      query: nullable("string"),
      article: { ...nullable("string"), description: "Article number such as '14.7' or '5'." },
      changed_in: { ...nullable("string"), description: "Year or date prefix of amending laws: '2026', '2025-07', '2025-07-09'." },
    },
  },
  label: () => "Хуулийн заалтыг уншиж байна",
  async run(a, ctx) {
    const lawId = str(a.law_id, 20);
    if (!/^\d{1,20}$/.test(lawId)) return { error: "law_id буруу байна." };
    const doc = await ctx.data.lawDocument(lawId);
    if (!doc) return { error: "Энэ актын эх бичвэр олдсонгүй." };
    const url = `https://legalinfo.mn/mn/detail?lawId=${lawId}`;
    const ref = ctx.sources.add({ title: `${doc.title} — хүчин төгөлдөр эх бичвэр (legalinfo.mn)`, url, publisher: "legalinfo.mn" });
    const article = optStr(a.article, 12);
    const query = optStr(a.query, 160);
    const changedIn = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(str(a.changed_in, 10)) ? str(a.changed_in, 10) : null;
    const changes = changedIn ? changesIn(doc, changedIn) : [];
    const words = query ? queryWords(query) : [];

    let picked: LawArticle[];
    if (article) {
      picked = doc.articles.filter((x) => x.number === article || x.number.startsWith(`${article}.`)).slice(0, 4);
    } else if (words.length) {
      const phrase = normalize(query!);
      // Repealed articles stay on legalinfo.mn for history; they are never offered as the law in force.
      picked = doc.articles
        .filter((x) => !x.repealed && x.paragraphs.length)
        .map((x) => ({ x, score: passageHits(words, x.heading) * 2 + passageHits(words, x.paragraphs.join(" ")) + (normalize(x.paragraphs.join(" ")).includes(phrase) ? 3 : 0) }))
        .filter((r) => r.score > 0)
        .sort((p, q) => q.score - p.score)
        .slice(0, 5)
        .map((r) => r.x);
    } else picked = [];
    const kindLabel = { added: "нэмсэн", amended: "өөрчилсөн", repealed: "хүчингүй болгосон", other: "өөрчлөлт" } as const;

    return {
      ref,
      title: doc.title,
      dateline: doc.dateline,
      articles_total: doc.articles.length,
      articles_repealed: doc.articles.filter((x) => x.repealed).length,
      amendment_history: amendmentHistory(doc).slice(0, 15),
      ...(changedIn
        ? {
            changes_in_period: {
              period: changedIn,
              total: changes.length,
              changes: changes.slice(0, 16).map((c) => ({ date: c.date, kind: kindLabel[c.kind], article: clip(c.article, 110), wording: official(c.text, 420) })),
            },
          }
        : {}),
      articles: picked.map((x) =>
        x.repealed
          ? { number: x.number, heading: x.heading, status: "ХҮЧИНГҮЙ БОЛСОН — энэ зүйл одоо мөрдөгдөхгүй", notes: x.notes.slice(-3) }
          : {
              number: x.number,
              chapter: x.chapter,
              text: articleExcerpt(x, words, 1_800),
              ...(x.repealedParagraphs ? { repealed_paragraphs_omitted: x.repealedParagraphs } : {}),
              recent_amendment_notes: x.notes.slice(-4),
            },
      ),
      ...(picked.length || changedIn
        ? {}
        : {
            table_of_contents: doc.articles.filter((x) => !x.repealed).slice(0, 90).map((x) => clip(x.heading, 110)),
            note: query || article ? "Тохирох (хүчин төгөлдөр) зүйл олдсонгүй; гарчгийн жагсаалтыг харуулав." : undefined,
          }),
    };
  },
};

const searchPassedActs: ToolDef = {
  name: "search_passed_acts",
  description:
    "Parliament's own register of passed laws and resolutions (www.parliament.mn/laws, 7,000+ acts with passage dates). Keyword search in titles, sorted newest or oldest first, 20 per page. " +
    "Use it for when a law or its amendments were passed and for the sequence of amendments over the years. The register can lag by weeks — for the latest changes use read_law's amendment_history.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["keywords", "type", "sort", "page"],
    properties: {
      keywords: nullable("string"),
      type: { type: "string", enum: ["any", "law", "resolution"] },
      sort: { type: "string", enum: ["newest", "oldest"] },
      page: { type: "integer", description: "1-based page number." },
    },
  },
  label: (a) => `УИХ-ын баталсан хууль, тогтоолоос хайж байна${str(a.keywords, 50) ? `: «${str(a.keywords, 50)}»` : ""}`,
  async run(a, ctx) {
    const res = await ctx.data.passedActs({
      keywords: optStr(a.keywords, 100) ?? undefined,
      type: enumArg(a.type, ["any", "law", "resolution"] as const, "any"),
      sort: enumArg(a.sort, ["newest", "oldest"] as const, "newest"),
      page: intArg(a.page, 1, 400) ?? 1,
    });
    return {
      total: res.total,
      page: intArg(a.page, 1, 400) ?? 1,
      results: res.items.map((i) => ({
        ref: ctx.sources.add({ title: `${i.title} (${i.date ?? ""}, parliament.mn)`, url: i.url, publisher: "parliament.mn" }),
        title: i.title,
        date_passed: i.date,
        kind: i.kind,
      })),
    };
  },
};

/* -------------------------------------------------------------------- bills */

function bulletinSummary(row: BulletinBill) {
  return {
    initiator: row.initiator,
    submitted_to_parliament: row.submittedDate,
    committee: row.committee,
    stage_history: row.stages.map((s) => `${s.label}${s.committeeNote ? ` (Байнгын хороо: ${s.committeeNote})` : ""}${s.plenaryNote ? ` (Нэгдсэн хуралдаан: ${s.plenaryNote})` : ""}`),
    list_snapshot_date: row.snapshotDate,
  };
}

const searchBills: ToolDef = {
  name: "search_bills",
  description:
    "Search draft laws and bills: LawForum (lawforum.parliament.mn, ~1,000 drafts and submitted bills since 2016, matched by title) and Parliament's list of bills under deliberation " +
    "(stage history, initiator, submission date, committee; snapshot date is given). Without a query, returns the most recent bills. " +
    "Note: a LawForum publication date is not the formal submission date; status 'drafting' = open for public comment, 'submitted' = submitted to Parliament.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["query", "year", "status"],
    properties: {
      query: nullable("string"),
      year: nullable("integer"),
      status: { type: "string", enum: ["any", "drafting", "submitted"] },
    },
  },
  label: (a) => `Хуулийн төслүүдээс хайж байна${str(a.query, 50) ? `: «${str(a.query, 50)}»` : ""}`,
  async run(a, ctx) {
    const [bills, rows] = await Promise.all([ctx.data.bills(), ctx.data.bulletin().catch(() => [] as BulletinBill[])]);
    const query = optStr(a.query, 120);
    const words = query ? queryWords(query) : [];
    const year = intArg(a.year, 2000, 2100);
    const status = enumArg(a.status, ["any", "drafting", "submitted"] as const, "any");

    const scored = bills
      .filter((b) => (!year || b.year === year) && (status === "any" || b.stage === status))
      .map((b) => ({ b, score: words.length ? titleScore(words, b.title) : 1 }))
      .filter((r) => r.score > 0)
      .sort((p, q) => q.score - p.score || q.b.publishedDate.localeCompare(p.b.publishedDate));
    const linkedRows = new Set<number>();
    const results: unknown[] = scored.slice(0, 10).map(({ b }) => {
      const row = linkBulletin(b, rows);
      if (row) linkedRows.add(row.id);
      return {
        ref: ctx.sources.add({ title: `${b.title} (LawForum)`, url: b.url, publisher: "LawForum" }),
        bill_id: b.id,
        title: b.title,
        type: b.typeTitle,
        lawforum_listing: stageListing(b.stage),
        published_on_lawforum: b.publishedDate,
        ...(row ? { in_parliament: bulletinSummary(row) } : {}),
      };
    });
    const bulletinOnly = rows
      .filter((r) => !linkedRows.has(r.id) && (!words.length || titleScore(words, r.title) > 0) && (!year || r.submittedDate?.startsWith(String(year))))
      .slice(0, words.length ? 5 : 0)
      .map((r) => ({
        ref: ctx.sources.add({ title: `${r.title} (УИХ-ын хуулийн төслийн мэдээлэл)`, url: r.url, publisher: "new.parliament.mn" }),
        bill_id: linkLawForum(r, bills)?.id ?? null,
        title: r.title,
        type: r.category,
        in_parliament: bulletinSummary(r),
      }));
    return { total_matched: scored.length, results: [...results, ...bulletinOnly] };
  },
};

const readBill: ToolDef = {
  name: "read_bill",
  description: "Read a bill's text on LawForum by bill_id (from search_bills): outline, the most relevant clauses (by query words, or purpose/scope), attached official files and its stage in Parliament if known.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["bill_id", "query"],
    properties: { bill_id: { type: "integer" }, query: nullable("string") },
  },
  label: () => "Хуулийн төслийг уншиж байна",
  async run(a, ctx) {
    const id = intArg(a.bill_id, 1, 9_999_999);
    if (!id) return { error: "bill_id буруу байна." };
    const [bills, rows] = await Promise.all([ctx.data.bills(), ctx.data.bulletin().catch(() => [] as BulletinBill[])]);
    const bill = bills.find((b) => b.id === id);
    if (!bill) return { error: "LawForum дээр ийм дугаартай нийтэд нээлттэй төсөл олдсонгүй." };
    const doc = await ctx.data.billDocument(bill).catch(() => null);
    const row = linkBulletin(bill, rows);
    const query = optStr(a.query, 160);
    const words = query ? queryWords(query).filter((w) => !topicTokens(bill.title).some((t) => similar(w, t))) : [];
    const body = doc?.clauses.filter((c) => !c.isHeading) ?? [];
    let clauses = words.length
      ? body.map((c) => ({ c, s: passageHits(words, `${c.article} ${c.text}`) })).filter((r) => r.s > 0).sort((p, q) => q.s - p.s).map((r) => r.c)
      : [];
    if (!clauses.length) {
      const purpose = body.find((c) => /зорилго/iu.test(c.article));
      const scope = body.filter((c) => /үйлчлэх\s*хүрээ|хамрах\s*хүрээ/iu.test(c.article)).slice(0, 2);
      clauses = [...new Set([purpose, ...scope, ...body.slice(0, 3)].filter((c): c is NonNullable<typeof c> => !!c))];
    }
    return {
      ref: ctx.sources.add({ title: `${bill.title} (LawForum)`, url: bill.url, publisher: "LawForum" }),
      title: bill.title,
      type: bill.typeTitle,
      category: bill.categoryTitle,
      lawforum_listing: stageListing(bill.stage),
      published_on_lawforum: bill.publishedDate,
      ...(row ? { in_parliament: bulletinSummary(row) } : { in_parliament: null }),
      outline: doc?.clauses.filter((c) => c.isHeading).slice(0, 40).map((c) => clip(c.text, 100)) ?? [],
      clauses: clauses.slice(0, 6).map((c) => ({
        ref: ctx.sources.add({ title: `${bill.title}, ${c.number ? `${c.number} дэх хэсэг` : clip(c.text, 40)} (LawForum)`, url: `${bill.url}#${c.anchor}`, publisher: "LawForum" }),
        number: c.number,
        article: c.article,
        text: official(c.text, 900),
      })),
      attached_files: [...new Set(doc?.files.map((f) => f.label) ?? [])].slice(0, 12),
      note: doc && !doc.clauses.length ? "Энэ төслийн LawForum хуудсанд задлан уншиж болох эх бичвэр олдсонгүй." : undefined,
    };
  },
};

/* ------------------------------------------------------- meetings and votes */

const findMeetings: ToolDef = {
  name: "find_meetings",
  description:
    "Find Parliament's plenary sittings ('чуулганы нэгдсэн хуралдаан') in a date range (YYYY-MM-DD, inclusive), with their agenda items. Coverage: plenary sittings with recorded votes from 2025-03 onward. " +
    "Use search_votes with the meeting_id for what was voted/passed, read_transcript for what was said, and site_search for committee meetings, conferences or events.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["date_from", "date_to"],
    properties: { date_from: { type: "string" }, date_to: { type: "string" } },
  },
  label: (a) => `${str(a.date_from, 10)}${str(a.date_to, 10) && str(a.date_to, 10) !== str(a.date_from, 10) ? `–${str(a.date_to, 10)}` : ""}-ны хуралдааныг хайж байна`,
  async run(a, ctx) {
    const from = dateArg(a.date_from);
    const to = dateArg(a.date_to) ?? from;
    if (!from || !to) return { error: "Огноог YYYY-MM-DD хэлбэрээр өгнө үү." };
    const index = await ctx.data.meetingsIndex();
    const inRange = index.filter((m) => m.date >= from && m.date <= to).sort((p, q) => p.date.localeCompare(q.date));
    const detailed = await Promise.all(inRange.slice(0, 5).map((m) => ctx.data.meeting(m.id).catch(() => null)));
    return {
      coverage: index.length ? `${index[index.length - 1].date} – ${index[0].date}` : "мэдээлэл алга",
      meetings: inRange.slice(0, 20).map((m, i) => {
        const d = detailed[i];
        return {
          ref: ctx.sources.add({ title: `${m.title}, ${m.date} (new.parliament.mn)`, url: m.url, publisher: "new.parliament.mn" }),
          meeting_id: m.id,
          title: m.title,
          date: m.date,
          ...(d ? { description: d.description, agenda: d.agenda.slice(0, 15).map((x) => clip(x.title, 200)) } : {}),
        };
      }),
      note: inRange.length ? undefined : "Энэ хугацаанд нэгдсэн хуралдаан бүртгэгдээгүй (эсвэл хамрах хүрээнээс гадуур). Ойр огноог шалгаж болно.",
    };
  },
};

async function pollsByTerms(data: ParliamentData, words: string[], window: { from?: string; to?: string }, limit: number): Promise<PollRecord[]> {
  const stems = [...new Set(words.map((t) => (t.includes(" ") ? t : stem(t))))].filter((t) => t.length >= 4).sort((p, q) => q.length - p.length).slice(0, 3);
  if (!stems.length) return [];
  const batches = await Promise.all(stems.map((s) => data.searchPolls({ search: s, ...window, limit: 15 }).catch(() => [] as PollRecord[])));
  const scored = new Map<number, { poll: PollRecord; hits: number }>();
  for (const poll of batches.flat()) {
    const text = normalize(`${poll.motion} ${poll.agendaTitle ?? ""}`);
    const hits = stems.filter((s) => text.includes(normalize(s))).length;
    if (hits && (scored.get(poll.id)?.hits ?? 0) < hits) scored.set(poll.id, { poll, hits });
  }
  return [...scored.values()].sort((p, q) => q.hits - p.hits || q.poll.date.localeCompare(p.poll.date)).slice(0, limit).map((r) => r.poll);
}

const searchVotes: ToolDef = {
  name: "search_votes",
  description:
    "Search official plenary votes (new.parliament.mn, 3,000+ votes from 2025): by words in the motion, by date range, or all votes of one meeting (meeting_id from find_meetings). " +
    "Each vote gives the motion text, for/against counts and the official result. Final passage votes contain 'эцэслэн батлах'.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["query", "date_from", "date_to", "meeting_id"],
    properties: { query: nullable("string"), date_from: nullable("string"), date_to: nullable("string"), meeting_id: nullable("integer") },
  },
  label: (a) => `Санал хураалтыг хайж байна${str(a.query, 50) ? `: «${str(a.query, 50)}»` : ""}`,
  async run(a, ctx) {
    const query = optStr(a.query, 120);
    let from = dateArg(a.date_from);
    let to = dateArg(a.date_to);
    if (from && !to) to = from;
    if (to && !from) from = to;
    const window = from && to ? { from, to } : {};
    const meetingId = intArg(a.meeting_id, 1, 100_000);
    let polls: PollRecord[];
    if (meetingId) polls = await ctx.data.searchPolls({ search: query ? stem(queryWords(query)[0] ?? query) : "", meetingId, limit: 30 });
    else if (query) {
      polls = await ctx.data.searchPolls({ search: query, ...window, limit: 20 });
      if (!polls.length) polls = await pollsByTerms(ctx.data, queryWords(query), window, 15);
    } else if (from) polls = await ctx.data.searchPolls({ search: "", ...window, limit: 30 });
    else return { error: "query, огноо эсвэл meeting_id-н аль нэгийг өгнө үү." };
    return {
      results: polls.slice(0, 18).map((p) => ({
        ref: ctx.sources.add({ title: `Санал хураалт, ${p.date} — ${clip(p.motion, 90)}`, url: p.url, publisher: "new.parliament.mn" }),
        vote_id: p.id,
        date: p.date,
        motion: official(p.motion, 380),
        agenda_item: p.agendaTitle ? clip(p.agendaTitle, 200) : null,
        for: p.forCount,
        against: p.againstCount,
        total_voted: p.totalVoted,
        result: p.resultLabel,
      })),
      note: polls.length > 18 ? `Нийт ${polls.length}-аас эхний 18.` : undefined,
    };
  },
};

const readTranscript: ToolDef = {
  name: "read_transcript",
  description: "Read the official verbatim record (protocol) of a plenary sitting by meeting_id: who said what. Filter by words and/or speaker name; returns matching excerpts.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["meeting_id", "query", "speaker"],
    properties: { meeting_id: { type: "integer" }, query: nullable("string"), speaker: nullable("string") },
  },
  label: () => "Хуралдаанд юу ярьсныг уншиж байна",
  async run(a, ctx) {
    const id = intArg(a.meeting_id, 1, 100_000);
    if (!id) return { error: "meeting_id буруу байна." };
    const [entries, info] = await Promise.all([ctx.data.transcript(id), ctx.data.meeting(id).catch(() => null)]);
    const query = optStr(a.query, 120);
    const speaker = optStr(a.speaker, 60);
    const words = query ? queryWords(query) : [];
    const matches = entries.filter(
      (e) => (!speaker || normalize(e.speaker ?? "").includes(normalize(speaker).replace(/^.\./, ""))) && (!words.length || passageHits(words, e.text) > 0),
    );
    const excerpt = (text: string) => {
      if (!words.length) return official(text, 450);
      const lower = normalize(text);
      const at = words.map((w) => lower.indexOf(stem(w))).filter((i) => i >= 0).sort((p, q) => p - q)[0] ?? 0;
      const start = Math.max(0, at - 250);
      return `${start ? "…" : ""}${official(text.slice(start), 750)}`;
    };
    const title = info ? `${info.title}, ${info.date}` : `Хуралдаан ${id}`;
    return {
      ref: ctx.sources.add({ title: `Хуралдааны тэмдэглэл — ${title}`, url: info?.url ?? `https://new.parliament.mn/meeting-info/${id}`, publisher: "new.parliament.mn" }),
      meeting: title,
      total_speeches: entries.length,
      matching_speeches: matches.length,
      excerpts: matches.slice(0, 8).map((e) => ({ order: e.order, speaker: e.speaker, party: e.party, text: excerpt(e.text) })),
    };
  },
};

/* ------------------------------------------------------------------ members */

function memberPositions(m: MemberRecord): string[] {
  return m.positions.filter((p) => p.unitType !== "PARLIAMENT" || p.title !== "Гишүүн").map((p) => `${p.unit} — ${p.title}`);
}

const findMembers: ToolDef = {
  name: "find_members",
  description:
    "Find current members of Parliament (126) by name, party or committee. Returns party and committee/subcommittee roles (e.g. who chairs a committee). With no filters, lists the committees.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["name", "party", "committee"],
    properties: { name: nullable("string"), party: nullable("string"), committee: nullable("string") },
  },
  label: () => "УИХ-ын гишүүдийн мэдээллийг хайж байна",
  async run(a, ctx) {
    const members = await ctx.data.members();
    const name = optStr(a.name, 60);
    const party = optStr(a.party, 60);
    const committee = optStr(a.committee, 100);
    const nameWords = name ? tokens(name.replace(/^[А-ЯӨҮЁа-яөүё]\.\s?/u, "")) : [];
    const committeeWords = committee ? queryWords(committee).filter((w) => !/^байнг|^хороо|^дэд$/u.test(w)) : [];
    const filtered = members.filter(
      (m) =>
        (!nameWords.length || nameWords.some((w) => similar(w, normalize(m.firstName)) || similar(w, normalize(m.lastName)))) &&
        (!party || normalize(m.party ?? "").includes(normalize(party))) &&
        (!committeeWords.length || m.positions.some((p) => p.unitType !== "PARLIAMENT" && titleMatch(committeeWords, p.unit).coverage >= 0.5)),
    );
    if (!name && !party && !committee) {
      const committees = [...new Set(members.flatMap((m) => m.positions.filter((p) => p.unitType === "COMMITTEE").map((p) => p.unit)))].sort((p, q) => p.localeCompare(q, "mn"));
      return {
        total_members: members.length,
        committees,
        ref: ctx.sources.add({ title: "УИХ-ын гишүүдийн жагсаалт (new.parliament.mn)", url: "https://new.parliament.mn/member/list", publisher: "new.parliament.mn" }),
      };
    }
    return {
      total: filtered.length,
      results: filtered.slice(0, 25).map((m) => ({
        ref: ctx.sources.add({ title: `УИХ-ын гишүүн ${m.shortName} (new.parliament.mn)`, url: m.url, publisher: "new.parliament.mn" }),
        member_id: m.id,
        name: `${m.lastName} ${m.firstName}`,
        short_name: m.shortName,
        party: m.party,
        role: m.role,
        positions: memberPositions(m),
      })),
    };
  },
};

const memberProfile: ToolDef = {
  name: "member_profile",
  description: "Official profile of one member of Parliament by member_id: constituency, election, current positions and plenary attendance.",
  parameters: { type: "object", additionalProperties: false, required: ["member_id"], properties: { member_id: { type: "integer" } } },
  label: () => "Гишүүний мэдээллийг уншиж байна",
  async run(a, ctx) {
    const id = intArg(a.member_id, 1, 100_000);
    if (!id) return { error: "member_id буруу байна." };
    const [detail, members] = await Promise.all([ctx.data.memberDetail(id), ctx.data.members()]);
    const m = members.find((x) => x.id === id);
    if (!detail && !m) return { error: "Гишүүн олдсонгүй." };
    return {
      ref: ctx.sources.add({ title: `УИХ-ын гишүүн ${m?.shortName ?? detail?.fullName} (new.parliament.mn)`, url: detail?.url ?? m!.url, publisher: "new.parliament.mn" }),
      name: detail?.fullName ?? `${m?.lastName} ${m?.firstName}`,
      party: m?.party ?? null,
      constituency: detail?.constituency ?? null,
      election: detail ? [detail.electionSystem, detail.electionName].filter(Boolean).join("; ") || null : null,
      positions: detail?.positions.map((p) => `${p.unit} — ${p.title}`) ?? (m ? memberPositions(m) : []),
      attendance: detail?.attendance ? `${detail.attendance.percentage}% (${detail.attendance.present}/${detail.attendance.total} нэгдсэн хуралдаан; ${detail.attendance.scope})` : null,
    };
  },
};

/* ------------------------------------------------------------ schedule & site */

const parliamentSchedule: ToolDef = {
  name: "parliament_schedule",
  description: "Parliament's latest published weekly schedule (plenary, committee and working-group sittings with agenda items). Mention its dates: it may not be the current week.",
  parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
  label: () => "Хуралдааны хуваарийг шалгаж байна",
  async run(_a, ctx) {
    const week = await ctx.data.schedule();
    if (!week) return { error: "Хуваарь олдсонгүй." };
    const ref = ctx.sources.add({ title: `${week.title} (${week.startDate}–${week.endDate})`, url: week.url, publisher: "new.parliament.mn" });
    const days = [...new Set(week.events.map((e) => e.date))].sort();
    return {
      ref,
      week: `${week.startDate} – ${week.endDate}`,
      days: days.map((d) => ({
        date: d,
        events: week.events
          .filter((e) => e.date === d)
          .slice(0, 12)
          .map((e) => ({ time: e.time, kind: e.kind, title: clip(e.title, 140), agenda: e.agendaItems.slice(0, 6).map((x) => clip(x, 160)) })),
      })),
    };
  },
};

const siteSearch: ToolDef = {
  name: "site_search",
  description:
    "Search everything on new.parliament.mn (news, announcements, events, conferences, visits, press releases, pages). Use for events and anything the other tools do not cover.",
  parameters: { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string" } } },
  label: (a) => `УИХ-ын цахим хуудаснаас хайж байна: «${str(a.query, 60)}»`,
  async run(a, ctx) {
    const query = str(a.query, 100);
    if (!query) return { error: "query хоосон байна." };
    const hits = await ctx.data.siteSearch(query);
    return {
      results: hits.slice(0, 10).map((h) => ({
        ref: ctx.sources.add({ title: `${h.title} (new.parliament.mn)`, url: h.url, publisher: "new.parliament.mn" }),
        type: h.type,
        title: h.title,
        date: h.date,
        description: h.description ? clip(h.description, 300) : null,
      })),
    };
  },
};

const helpServices: ToolDef = {
  name: "find_help_services",
  description:
    "Where a person can get help: verified official organisations (state legal aid, the 11-11 citizens' complaints centre, the 108 child helpline, the Bar Association, " +
    "the Human Rights Commission, labour and welfare services, police, e-Mongolia, petitions to Parliament) with what they help with, and phone/hours/address ONLY where " +
    "verified on their own website. Use it whenever someone asks where to go, whom to call or how to get help. Never give phone numbers that are not in these results.",
  parameters: { type: "object", additionalProperties: false, required: ["need"], properties: { need: { type: "string", description: "The person's situation or need, in Mongolian." } } },
  label: () => "Хандаж болох байгууллагыг хайж байна",
  async run(a, ctx) {
    const need = str(a.need, 200);
    return {
      verified: "Байгууллага бүрийн албан ёсны цахим хуудаснаас 2026-09-25-нд шалгасан.",
      services: findHelpServices(need || "хууль зүйн туслалцаа").map((s) => ({
        ref: ctx.sources.add({ title: `${s.name} (${new URL(s.website).hostname})`, url: s.website, publisher: new URL(s.website).hostname }),
        name: s.name,
        helps_with: s.helpsWith,
        ...(s.phone ? { phone: s.phone } : {}),
        ...(s.hours ? { hours: s.hours } : {}),
        ...(s.address ? { address: s.address } : {}),
      })),
    };
  },
};

export const TOOLS: ToolDef[] = [
  searchLaws,
  readLaw,
  searchPassedActs,
  searchBills,
  readBill,
  findMeetings,
  searchVotes,
  readTranscript,
  findMembers,
  memberProfile,
  parliamentSchedule,
  siteSearch,
  helpServices,
];

export const TOOL_SCHEMAS = TOOLS.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters, strict: true }));

const MAX_TOOL_OUTPUT = 14_000;

/** Human-readable status for a tool call (shown in the UI while it runs). */
export function toolLabel(name: string, rawArgs: string): string {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return "Хайлт хийж байна";
  try {
    const args = JSON.parse(rawArgs || "{}");
    return tool.label(args && typeof args === "object" ? (args as Args) : {});
  } catch {
    return tool.label({});
  }
}

/** Run one tool call from the model. Never throws: failures become an error the model can explain. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<{ output: string; label: string }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { output: JSON.stringify({ error: `Unknown tool ${name}` }), label: name };
  let args: Args = {};
  try {
    const parsed = JSON.parse(rawArgs || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Args;
  } catch {
    return { output: JSON.stringify({ error: "Arguments were not valid JSON." }), label: tool.label({}) };
  }
  const label = tool.label(args);
  try {
    const result = await Promise.race([
      tool.run(args, ctx),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 25_000)),
    ]);
    const json = JSON.stringify(result, (_k, v) => (v === undefined ? undefined : v));
    return { output: json.length > MAX_TOOL_OUTPUT ? `${json.slice(0, MAX_TOOL_OUTPUT)}…(хэт урт тул таслав)` : json, label };
  } catch (error) {
    const reason = error instanceof Error && error.message === "timeout" ? "хугацаа хэтэрсэн" : "эх сурвалж түр боломжгүй";
    return { output: JSON.stringify({ error: `Албан ёсны эх сурвалжаас мэдээлэл авч чадсангүй (${reason}).` }), label };
  }
}
