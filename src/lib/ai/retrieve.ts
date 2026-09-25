import type { LawForumClause, LawForumDocument } from "../parliament/lawforum-page.ts";
import type { BillRecord, BulletinBill, MemberRecord, ParliamentData, PollRecord } from "../parliament/records.ts";
import { expandTopics, passageHits, similar, stem, titleMatch, topicTokens } from "../parliament/text.ts";
import { analyzeQuestion, type QuestionPlan } from "./intent.ts";
import * as E from "./evidence.ts";
import { clarifyAnswer, dataAnswer, insufficientAnswer, isOfficialUrl, policyAnswer } from "./compose.ts";
import type { ChatAnswer, ChatChoice, ChatEntity, ChatRequest, Evidence } from "./types.ts";

/**
 * Retrieval: question → official evidence (or a direct/clarifying answer).
 *
 * Structured questions (stage, counts, committee rosters) are answered or computed by the server.
 * Explanation questions get a few ranked passages for the model. Context (current page, previous
 * answer, a picked option) is a hint that decides what "энэ төсөл" means; it never limits the search.
 */

export const MAX_EVIDENCE = 8;
export const MAX_EVIDENCE_CHARS = 9_000;
const MAX_CLAUSES = 5;
const DAY = 86_400_000;

type Focus = NonNullable<ChatAnswer["focus"]>;

export type Retrieval =
  | { kind: "evidence"; plan: QuestionPlan; evidence: Evidence[]; entities: ChatEntity[]; focus?: Focus; notes: string[] }
  | { kind: "answer"; plan: QuestionPlan; answer: ChatAnswer };

type BillFocus = { bill?: BillRecord; row?: BulletinBill };

const DEICTIC_BILL = /(?:энэ|уг|тус|дээрх|тэр)\s+(?:хуулийн\s+)?(?:төс[өө]л|төсл|хуул|тогтоол)/iu;
const DEICTIC_VOTE = /(?:энэ|уг|тус|дээрх|тэр)\s+санал\s*хураалт/iu;

/* ------------------------------------------------------------ bill matching */

function titleSimilarity(a: string, b: string): number {
  const ta = [...new Set(topicTokens(a))];
  const tb = [...new Set(topicTokens(b))];
  if (!ta.length || !tb.length) return 0;
  const shared = ta.filter((x) => tb.some((y) => similar(x, y))).length;
  return shared / (ta.length + tb.length - shared);
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/**
 * Bulletin ↔ LawForum link. Amendment bills often share a title across years, so a link needs a
 * strong title match AND a LawForum publication within 10 days of the bulletin's submission date,
 * and it must be the only such candidate. Otherwise the records stay separate.
 */
export function linkBulletin(bill: BillRecord, rows: readonly BulletinBill[]): BulletinBill | undefined {
  if (bill.stage !== "submitted") return undefined;
  const hits = rows.filter((r) => r.submittedDate && daysApart(r.submittedDate, bill.publishedDate) <= 10 && titleSimilarity(bill.title, r.title) >= 0.6);
  return hits.length === 1 ? hits[0] : undefined;
}

export function linkLawForum(row: BulletinBill, bills: readonly BillRecord[]): BillRecord | undefined {
  if (!row.submittedDate) return undefined;
  const hits = bills.filter((b) => b.stage === "submitted" && daysApart(row.submittedDate!, b.publishedDate) <= 10 && titleSimilarity(b.title, row.title) >= 0.6);
  return hits.length === 1 ? hits[0] : undefined;
}

type Candidate = BillFocus & { title: string; date: string; score: number; coverage: number; hits: number };

function billCandidates(plan: QuestionPlan, bills: readonly BillRecord[], rows: readonly BulletinBill[]): Candidate[] {
  if (!plan.topics.length) return [];
  const out: Candidate[] = [];
  const score = (title: string) => {
    const m = titleMatch(plan.topics, title);
    return { ...m, score: m.hits ? m.coverage * 2 + m.hits * 0.5 : 0 };
  };
  // A year in the question boosts matching records but never excludes others: it may be part of a
  // mistaken premise ("…2025 онд батлагдсан…" about a 2026 bill), which the answer should correct.
  const yearBoost = (year: number) => (plan.years.includes(year) ? 1 : 0);
  const linkedRows = new Set<number>();
  for (const bill of bills) {
    const s = score(bill.title);
    if (!s.hits) continue;
    const row = linkBulletin(bill, rows);
    if (row) linkedRows.add(row.id);
    out.push({ bill, row, title: bill.title, date: bill.publishedDate, ...s, score: s.score + yearBoost(bill.year) });
  }
  for (const row of rows) {
    if (linkedRows.has(row.id)) continue;
    const s = score(row.title);
    const year = Number((row.submittedDate ?? row.snapshotDate).slice(0, 4));
    if (s.hits) out.push({ row, bill: linkLawForum(row, bills), title: row.title, date: row.submittedDate ?? row.snapshotDate, ...s, score: s.score + yearBoost(year) });
  }
  return out.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

function candidateEntity(c: BillFocus): ChatEntity {
  return c.bill ? { type: "bill", id: String(c.bill.id) } : { type: "bulletin", id: String(c.row!.id) };
}

function candidateChoice(c: Candidate | BillFocus & { title?: string }): ChatChoice {
  const title = c.bill?.title ?? c.row!.title;
  const detail = c.bill
    ? `${c.bill.typeTitle} · LawForum ${c.bill.publishedDate} · ${c.bill.stage === "submitted" ? "Өргөн мэдүүлсэн" : "Санал авч буй"}`
    : `УИХ-ын мэдээлэл · өргөн мэдүүлсэн ${c.row!.submittedDate ?? "огноо тэмдэглээгүй"}`;
  return { entity: candidateEntity(c), title, detail };
}

async function resolveBill(
  req: ChatRequest,
  plan: QuestionPlan,
  data: ParliamentData,
): Promise<{ focus?: BillFocus; choices?: ChatChoice[]; candidates: Candidate[] }> {
  const [bills, rows] = await Promise.all([data.bills(), data.bulletin().catch(() => [] as BulletinBill[])]);
  const fromEntity = (e: ChatEntity | undefined): BillFocus | undefined => {
    if (e?.type === "bill") {
      const bill = bills.find((b) => String(b.id) === e.id);
      return bill ? { bill, row: linkBulletin(bill, rows) } : undefined;
    }
    if (e?.type === "bulletin") {
      const row = rows.find((r) => String(r.id) === e.id);
      return row ? { row, bill: linkLawForum(row, bills) } : undefined;
    }
    return undefined;
  };

  const selected = fromEntity(req.selected);
  if (selected) return { focus: selected, candidates: [] };
  for (const id of plan.billIds) {
    const bill = bills.find((b) => b.id === id);
    if (bill) return { focus: { bill, row: linkBulletin(bill, rows) }, candidates: [] };
  }

  // Conversation first (most recent), then the page the user is on.
  const hinted = [...req.lastEntities, req.context].map(fromEntity).find(Boolean);
  const candidates = billCandidates(plan, bills, rows);
  if (hinted && DEICTIC_BILL.test(req.question)) return { focus: hinted, candidates };

  const best = candidates[0];
  const strong = best && (best.coverage >= 0.6 || (best.hits >= 2 && best.coverage >= 0.4));
  if (strong) {
    const close = candidates.filter((c) => c.score >= best.score * 0.85);
    if (close.length === 1) return { focus: best, candidates };
    return { choices: close.slice(0, 5).map(candidateChoice), candidates };
  }
  if (hinted && (plan.deictic || !plan.topics.length || !best)) return { focus: hinted, candidates };
  return { candidates };
}

function focusOf(f: BillFocus): Focus {
  return { entity: candidateEntity(f), title: f.bill?.title ?? f.row!.title };
}

/* --------------------------------------------------------------- utilities */

function bound(evidence: Evidence[]): Evidence[] {
  const out: Evidence[] = [];
  const seen = new Set<string>();
  let chars = 0;
  for (const e of evidence) {
    if (out.length >= MAX_EVIDENCE || seen.has(e.sourceId) || !isOfficialUrl(e.url) || !e.text.trim()) continue;
    if (chars + e.text.length > MAX_EVIDENCE_CHARS) continue;
    seen.add(e.sourceId);
    chars += e.text.length;
    out.push(e);
  }
  return out;
}

function result(plan: QuestionPlan, evidence: Evidence[], opts: { entities?: ChatEntity[]; focus?: Focus; notes?: string[] } = {}): Retrieval {
  const bounded = bound(evidence);
  if (!bounded.length) return { kind: "answer", plan, answer: insufficientAnswer({ entities: opts.entities, focus: opts.focus }) };
  return { kind: "evidence", plan, evidence: bounded, entities: opts.entities ?? [], focus: opts.focus, notes: opts.notes ?? [] };
}

const answer = (plan: QuestionPlan, a: ChatAnswer): Retrieval => ({ kind: "answer", plan, answer: a });

const NEED_BILL =
  "Аль төсөл, хуулийн тухай асууж байгаагаа нэрээр нь тодруулна уу. Жишээ нь: «Өгөгдлийн тухай хуулийн төсөл одоо ямар шатанд байна?»";

function searchPhrase(words: string[], max = 3): string {
  return [...new Set(words.map(stem))].filter((w) => w.length >= 3).slice(0, max).join(" ");
}

function yearWindow(plan: QuestionPlan): { from?: string; to?: string } {
  if (!plan.years.length) return {};
  const from = Math.min(...plan.years);
  const to = Math.max(...plan.years);
  return { from: `${from}-01-01`, to: `${to}-12-31` };
}

/* ------------------------------------------------------------------ clauses */

const ARTICLE_REF = /(\d{1,3})\s*(?:дугаар|дүгээр|дахь|дэх|-р)\s*зүйл/iu;

export function selectClauses(bill: BillRecord, doc: LawForumDocument, plan: QuestionPlan, question: string): LawForumClause[] {
  const body = doc.clauses.filter((c) => !c.isHeading);
  if (body.length <= MAX_CLAUSES) return body;

  const own = topicTokens(bill.title);
  const topics = expandTopics(plan.topics.filter((t) => !own.some((o) => similar(t, o))));
  const picked: LawForumClause[] = [];
  const add = (c: LawForumClause | undefined) => {
    if (c && !picked.includes(c) && picked.length < MAX_CLAUSES) picked.push(c);
  };

  for (const n of plan.clauseNumbers) add(body.find((c) => c.number === n));
  const article = ARTICLE_REF.exec(question)?.[1];
  if (article) body.filter((c) => c.number.startsWith(`${article}.`)).slice(0, 3).forEach(add);

  const under = (pattern: RegExp) => body.filter((c) => pattern.test(c.article));
  if (plan.wantsPurpose || !topics.length) {
    add(under(/зорилго/iu)[0] ?? body[0]);
    add(under(/үйлчлэх\s*хүрээ|хамрах\s*хүрээ/iu)[0]);
  }
  if (plan.wantsScope) under(/үйлчлэх\s*хүрээ|хамрах\s*хүрээ/iu).slice(0, 2).forEach(add);

  if (topics.length) {
    body
      .map((c) => ({ c, score: passageHits(topics, `${c.article} ${c.text}`) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .forEach((r) => add(r.c));
  }
  if (!picked.length) add(body[0]);
  return picked;
}

/* ------------------------------------------------------------------ intents */

async function explainBill(req: ChatRequest, plan: QuestionPlan, data: ParliamentData, focus: BillFocus): Promise<Retrieval> {
  const evidence: Evidence[] = [];
  const notes: string[] = [];
  const { bill, row } = focus;
  if (bill) {
    evidence.push(E.billEvidence(bill));
    let doc: LawForumDocument | null = null;
    try {
      doc = await data.billDocument(bill);
    } catch {
      notes.push("LawForum дээрх төслийн эх бичвэрийг одоогоор татаж чадсангүй; зөвхөн бүртгэлийн мэдээлэл өгөгдсөн.");
    }
    if (doc) {
      const clauses = selectClauses(bill, doc, plan, req.question);
      if (plan.wantsPurpose || !clauses.length) {
        const outline = E.outlineEvidence(bill, doc);
        if (outline) evidence.push(outline);
      }
      evidence.push(...clauses.map((c) => E.clauseEvidence(bill, c)));
      if (plan.wantsFiles || !doc.clauses.length) {
        const files = E.filesEvidence(bill, doc);
        if (files) evidence.push(files);
      }
      if (!doc.clauses.length) notes.push("Энэ төслийн LawForum хуудсанд задлан уншиж болох эх бичвэр олдсонгүй.");
    }
  }
  if (row) evidence.push(E.bulletinEvidence(row));
  notes.push("Төслийн заалт нь санал болгож буй өөрчлөлт бөгөөд батлагдсан хууль биш.");
  const focusInfo = focusOf(focus);
  return result(plan, evidence, { entities: [focusInfo.entity], focus: focusInfo, notes });
}

async function billQuestion(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  const r = await resolveBill(req, plan, data);
  if (r.choices) return answer(plan, clarifyAnswer("Асуултад хэд хэдэн төсөл тохирч байна. Алийг нь хэлж байгаагаа сонгоно уу.", r.choices));
  if (!r.focus) {
    if (plan.topics.length) return broadSearch(req, plan, data);
    return answer(plan, clarifyAnswer(NEED_BILL, []));
  }
  if (plan.intent === "bill-stage") return answer(plan, stageAnswer(r.focus));
  return explainBill(req, plan, data, r.focus);
}

/** Stage questions are answered from structured official records, without the model. */
export function stageAnswer(focus: BillFocus): ChatAnswer {
  const { bill, row } = focus;
  const points: { text: string; sources: Evidence[] }[] = [];
  if (bill) {
    points.push({ text: `«${bill.title}» (${bill.typeTitle}) нь ${E.stageListing(bill.stage)} байна. LawForum-д нийтэлсэн огноо нь ${bill.publishedDate}.`, sources: [E.billEvidence(bill)] });
  }
  let limitations: string;
  if (row) {
    const ev = E.bulletinEvidence(row);
    points.push({
      text: `УИХ-ын «хэлэлцүүлгийн шатанд байгаа төслүүд»-ийн мэдээлэлд (${row.snapshotDate}-ны байдлаар): санаачлагч — ${row.initiator ?? "тэмдэглээгүй"}, өргөн мэдүүлсэн огноо — ${row.submittedDate ?? "тэмдэглээгүй"}, хариуцах байнгын хороо — ${row.committee ?? "тэмдэглээгүй"}.`,
      sources: [ev],
    });
    if (row.stages.length) {
      const stages = row.stages.map((s) => {
        const dates = [s.committeeNote && `Байнгын хороо ${s.committeeNote}`, s.plenaryNote && `Нэгдсэн хуралдаан ${s.plenaryNote}`].filter(Boolean).join(", ");
        return `«${s.label}»${dates ? ` (${dates})` : " (огноо тэмдэглээгүй)"}`;
      });
      points.push({ text: `Тэмдэглэгдсэн хэлэлцүүлгийн шатууд: ${stages.join(" → ")}.`, sources: [ev] });
    }
    limitations = `Энэ мэдээлэл ${row.snapshotDate}-ны байдлаар эмхэтгэгдсэн тул түүнээс хойшхи явцыг агуулахгүй байж болно.`;
  } else {
    limitations = "УИХ-ын хэлэлцүүлгийн шатны мэдээллээс энэ төслийг баттай тааруулж чадсангүй. Иймд хэлэлцүүлгийн нарийвчилсан шат, албан ёсоор өргөн мэдүүлсэн огноог баталгаажуулах боломжгүй.";
  }
  const focusInfo = focusOf(focus);
  return dataAnswer(points, { limitations, entities: [focusInfo.entity], focus: focusInfo });
}

async function listBills(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  const [bills, rows] = await Promise.all([data.bills(), data.bulletin().catch(() => [] as BulletinBill[])]);
  const topics = expandTopics(plan.topics);
  const today = data.today();
  const recentFrom = new Date(Date.parse(today) - 60 * DAY).toISOString().slice(0, 10);
  const useRecent = !plan.years.length && (plan.recent || !topics.length);
  const matches = bills
    .filter((b) =>
      (!plan.years.length || plan.years.includes(b.year)) &&
      (!useRecent || b.publishedDate >= recentFrom) &&
      (!plan.stageFilter || b.stage === plan.stageFilter) &&
      (!plan.typeFilter || b.typeId === plan.typeFilter) &&
      (!topics.length || titleMatch(topics, b.title).hits > 0),
    )
    .sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || b.id - a.id);

  const parts = [
    plan.topics.length ? `«${plan.topics.join(" ")}» сэдэвтэй нэрийн хувьд холбогдох` : "",
    plan.years.length ? `${plan.years.join(", ")} онд LawForum-д нийтлэгдсэн` : useRecent ? `${recentFrom}-с хойш LawForum-д нийтлэгдсэн` : "",
    plan.stageFilter === "drafting" ? "санал авч буй" : plan.stageFilter === "submitted" ? "өргөн мэдүүлсэн" : "",
    plan.typeFilter === 2 ? "тогтоолын" : "",
  ].filter(Boolean);
  const label = `${parts.join(", ")} төслүүд`;
  const evidence: Evidence[] = [E.billListEvidence(label, matches.length, matches.slice(0, 8))];
  evidence.push(...matches.slice(0, 4).map(E.billEvidence));
  if (topics.length) {
    rows
      .filter((r) => titleMatch(topics, r.title).hits > 0 && (!plan.years.length || (r.submittedDate && plan.years.includes(Number(r.submittedDate.slice(0, 4))))))
      .slice(0, 2)
      .forEach((r) => evidence.push(E.bulletinEvidence(r)));
  }
  const notes = [
    "Жагсаалтын тоог сервер албан ёсны бүртгэлээс тоолсон; тоог өөрчилж, нэмж бүү бич.",
    "Сэдвийн шүүлт нь зөвхөн төслийн нэрэнд үндэслэсэн тул нэрэнд тухайн үг ороогүй холбогдох төсөл орхигдож болно.",
  ];
  if (!matches.length && evidence.length === 1) return answer(plan, insufficientAnswer({ message: "Хайлтын нөхцөлд тохирох төсөл LawForum-ын бүртгэлээс олдсонгүй." }));
  return result(plan, evidence, { entities: matches.slice(0, 3).map((b) => ({ type: "bill" as const, id: String(b.id) })), notes });
}

async function currentAgenda(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  const [week, bills, rows] = await Promise.all([
    data.schedule().catch(() => null),
    data.bills().catch(() => [] as BillRecord[]),
    data.bulletin().catch(() => [] as BulletinBill[]),
  ]);
  const evidence: Evidence[] = [];
  const topics = expandTopics(plan.topics);
  if (week) {
    const events = week.events.filter((e) => e.kind !== "OTHER" && (!topics.length || passageHits(topics, `${e.title} ${e.agendaItems.join(" ")}`) > 0));
    const dates = [...new Set(events.map((e) => e.date))].sort();
    for (const date of dates.slice(0, 4)) {
      const day = events.filter((e) => e.date === date).sort((a, b) => (a.kind === "PLENARY" ? -1 : b.kind === "PLENARY" ? 1 : 0));
      evidence.push(E.scheduleDayEvidence(week, date, day.slice(0, 8)));
    }
  }
  const today = data.today();
  const from = new Date(Date.parse(today) - 45 * DAY).toISOString().slice(0, 10);
  const recent = bills
    .filter((b) => b.stage === "submitted" && b.publishedDate >= from && (!topics.length || titleMatch(topics, b.title).hits > 0))
    .sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
  if (recent.length) evidence.push(E.billListEvidence(`${from}-с хойш LawForum-ын «Өргөн мэдүүлсэн төслүүд» хэсэгт нийтлэгдсэн төслүүд`, recent.length, recent.slice(0, 6)));
  const summary = E.bulletinSummaryEvidence(rows);
  if (summary) evidence.push(summary);
  const notes = [
    `Өнөөдөр ${today}. Хуваарь нь хамгийн сүүлд нийтлэгдсэн долоо хоногийнх тул огноог нь заавал дурд.`,
    "Хуваарьт орсон нь тухайн асуудлыг хэлэлцэхээр төлөвлөсөн гэсэн үг; хэлэлцэж дууссан эсэхийг баталгаажуулахгүй.",
  ];
  return result(plan, evidence, { notes });
}

async function voteQuestion(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  const hinted = [req.selected, ...req.lastEntities, req.context].find((e) => e?.type === "vote");
  if (hinted && (DEICTIC_VOTE.test(req.question) || req.selected?.type === "vote" || !plan.topics.length)) {
    const p = await data.poll(Number(hinted.id));
    if (p) return result(plan, [E.pollEvidence(p)], { entities: [{ type: "vote", id: String(p.id) }] });
  }

  let phrase = "";
  let focus: BillFocus | undefined;
  let notBefore: string | undefined;
  // Only an explicit reference ("энэ төсөл", a picked option, a bill id) pins the search to one bill.
  // A bill named in the question is searched by name instead: "Боловсролын ерөнхий хуулийн…" may mean the
  // original law or any of its amendments, and the vote text itself says which.
  if ((DEICTIC_BILL.test(req.question) && (req.context || req.lastEntities.length)) || req.selected || plan.billIds.length) {
    const r = await resolveBill(req, { ...plan, topics: [] }, data);
    focus = r.focus;
  }
  if (focus) {
    phrase = searchPhrase(topicTokens(focus.bill?.title ?? focus.row!.title));
    // A vote cannot precede the bill; this keeps same-titled bills from other years out.
    const start = focus.row?.submittedDate ?? focus.bill?.publishedDate;
    if (start) notBefore = new Date(Date.parse(start) - 5 * DAY).toISOString().slice(0, 10);
  } else {
    phrase = searchPhrase(plan.topics);
  }
  if (!phrase && !plan.recent) return answer(plan, clarifyAnswer("Аль асуудал, төслийн санал хураалтыг асууж байгаагаа тодруулна уу.", []));

  const window = yearWindow(plan);
  let polls: PollRecord[] = await data.searchPolls({ search: phrase, ...window, limit: 12 });
  if (!polls.length && phrase.includes(" ")) {
    const longest = phrase.split(" ").sort((a, b) => b.length - a.length)[0];
    polls = await data.searchPolls({ search: longest, ...window, limit: 12 });
  }
  if (notBefore) polls = polls.filter((p) => p.date >= notBefore!);
  const evidence = polls.slice(0, 6).map(E.pollEvidence);
  if (focus?.bill) evidence.unshift(E.billEvidence(focus.bill));
  if (!polls.length) {
    return answer(plan, insufficientAnswer({ message: "Холбогдох санал хураалт албан ёсны санал хураалтын бүртгэлээс олдсонгүй.", focus: focus && focusOf(focus), entities: focus ? [focusOf(focus).entity] : [] }));
  }
  const notes = [
    "Эдгээр нь албан ёсны санал хураалтын бүртгэлээс асуултын түлхүүр үгээр хайж олдсон санал хураалтууд. Асуултад хамаарах санал хураалт бүрийн асуулт (юуны төлөө санал хураасан), огноо, дүнг яг байгаагаар нь танилцуул.",
    "Санал хураалтын асуулт нь хэрэглэгчийн нэрлэсэн төслөөс ялгаатай бол (жишээ нь нэмэлт, өөрчлөлтийн төсөл, эсвэл горимын санал) тэр ялгааг нь тодорхой хэл; өөр өөр санал хураалтыг нэг дүн болгож бүү нэгтгэ.",
    "Хэрэглэгчийн асуултад огт хамааралгүй санал хураалтыг орхи. Гишүүн, намыг эрэмбэлэх, үнэлэх бүү хий.",
  ];
  const f = focus && focusOf(focus);
  return result(plan, evidence, { entities: [...(f ? [f.entity] : []), ...polls.slice(0, 2).map((p) => ({ type: "vote" as const, id: String(p.id) }))].slice(0, 3), focus: f, notes });
}

function matchMembers(plan: QuestionPlan, members: readonly MemberRecord[]): MemberRecord[] {
  const found = new Map<number, MemberRecord>();
  for (const n of plan.names) {
    for (const m of members) {
      if (similar(n.name, m.firstName) && (!n.initial || m.lastName.startsWith(n.initial))) found.set(m.id, m);
    }
  }
  if (!found.size) {
    for (const t of plan.topics) {
      if (t.length < 4) continue;
      for (const m of members) if (stem(t) === stem(m.firstName) || (t.length >= 5 && similar(t, m.firstName.toLocaleLowerCase("mn")))) found.set(m.id, m);
    }
  }
  return [...found.values()];
}

async function memberQuestion(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  const members = await data.members();
  let matched = matchMembers(plan, members);
  if (!matched.length) {
    const hinted = [req.selected, ...req.lastEntities].find((e) => e?.type === "member");
    const m = hinted && members.find((x) => String(x.id) === hinted.id);
    if (m && (plan.deictic || !plan.topics.length || req.selected)) matched = [m];
  }
  if (req.selected?.type === "member") matched = matched.filter((m) => String(m.id) === req.selected!.id);
  if (!matched.length) {
    if (/нам/iu.test(req.question) && /хэдэн|суудал|бүрэлдэхүүн|хэд/iu.test(req.question)) {
      return result(plan, [E.partyCompositionEvidence(members)], { notes: ["Намыг эрэмбэлэх, үнэлэх бүү хий; зөвхөн тоог дурд."] });
    }
    return answer(plan, clarifyAnswer("Аль гишүүний тухай асууж байгаагаа овгийн эхний үсэг, нэрээр нь бичнэ үү. Жишээ нь: «Ц.Мөнхтуяа гишүүн ямар байнгын хороонд байдаг вэ?»", []));
  }
  if (matched.length > 1) {
    const choices = matched.slice(0, 6).map((m) => ({ entity: { type: "member" as const, id: String(m.id) }, title: `${m.lastName} ${m.firstName} (${m.shortName})`, detail: m.party ?? "УИХ-ын гишүүн" }));
    return answer(plan, clarifyAnswer("Энэ нэртэй хэд хэдэн гишүүн байна. Алийг нь хэлж байгаагаа сонгоно уу.", choices));
  }
  const m = matched[0];
  const detail = await data.memberDetail(m.id).catch(() => null);
  const entity: ChatEntity = { type: "member", id: String(m.id) };
  return result(plan, E.memberEvidence(m, detail, plan.attendance), {
    entities: [entity],
    focus: { entity, title: `${m.shortName} гишүүн` },
    notes: ["Гишүүнийг бусадтай харьцуулах, эрэмбэлэх, үнэлэх бүү хий."],
  });
}

async function committeeQuestion(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  const members = await data.members();
  if (matchMembers(plan, members).length) return memberQuestion(req, plan, data);
  const units = new Map<number, string>();
  for (const m of members) for (const p of m.positions) if (p.unitType === "COMMITTEE" || p.unitType === "SUBCOMMITTEE") units.set(p.unitId, p.unit);
  const scored = [...units.entries()]
    .map(([id, unit]) => ({ id, unit, ...titleMatch(plan.topics.filter((t) => !/^дарга|^гишүүд/.test(t)), unit) }))
    .filter((u) => u.hits > 0)
    .sort((a, b) => b.coverage - a.coverage || b.hits - a.hits);
  const best = scored[0];
  if (best && best.coverage >= 0.5 && (scored.length === 1 || scored[1].coverage < best.coverage)) {
    const roster = members.filter((m) => m.positions.some((p) => p.unitId === best.id));
    return result(plan, [E.committeeEvidence(best.id, best.unit, roster)], { notes: ["Гишүүдийг эрэмбэлэх, үнэлэх бүү хий."] });
  }
  const committees = [...units.values()].filter((unit) => /байнгын хороо$/iu.test(unit)).sort((a, b) => a.localeCompare(b, "mn"));
  if (!committees.length) return answer(plan, insufficientAnswer());
  return result(plan, [E.committeesListEvidence(committees)]);
}

async function sessionQuestion(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  const [sessions, week] = await Promise.all([data.sessions().catch(() => []), data.schedule().catch(() => null)]);
  const evidence: Evidence[] = [];
  if (sessions.length) evidence.push(E.sessionsEvidence(sessions));
  if (week) {
    const plenary = week.events.filter((e) => e.kind === "PLENARY");
    const dates = [...new Set(plenary.map((e) => e.date))].sort().slice(0, 3);
    for (const date of dates) evidence.push(E.scheduleDayEvidence(week, date, plenary.filter((e) => e.date === date)));
  }
  return result(plan, evidence, { notes: [`Өнөөдөр ${data.today()}.`] });
}

/** Fallback: a small search across bills, the bulletin and votes. Returns nothing rather than weak matches. */
async function broadSearch(req: ChatRequest, plan: QuestionPlan, data: ParliamentData): Promise<Retrieval> {
  if (!plan.topics.length) return answer(plan, insufficientAnswer());
  const [bills, rows] = await Promise.all([data.bills().catch(() => [] as BillRecord[]), data.bulletin().catch(() => [] as BulletinBill[])]);
  const candidates = billCandidates(plan, bills, rows).filter((c) => c.coverage >= 0.5 || c.hits >= 2).slice(0, 3);
  const evidence: Evidence[] = [];
  for (const c of candidates) {
    if (c.bill) evidence.push(E.billEvidence(c.bill));
    if (c.row) evidence.push(E.bulletinEvidence(c.row));
  }
  const phrase = searchPhrase(plan.topics, 2);
  if (phrase) {
    const polls = await data.searchPolls({ search: phrase, ...yearWindow(plan), limit: 3 }).catch(() => [] as PollRecord[]);
    evidence.push(...polls.map(E.pollEvidence));
  }
  if (!evidence.length) return answer(plan, insufficientAnswer());
  return result(plan, evidence, {
    entities: candidates.slice(0, 2).map(candidateEntity),
    notes: ["Эдгээр нь нэрийн хайлтаар олдсон бичлэгүүд; асуултад шууд хамааралгүй бол insufficientEvidence=true гэж тэмдэглэ."],
  });
}

/* --------------------------------------------------------------------- main */

export async function retrieve(req: ChatRequest, data: ParliamentData): Promise<Retrieval> {
  const plan = analyzeQuestion(req.question);
  if (plan.opinion) return answer(plan, policyAnswer());
  // An injection attempt without a (Mongolian) Parliament topic never reaches the model.
  if (plan.injection && !plan.topics.some((t) => /[Ѐ-ӿ]/u.test(t))) {
    return answer(plan, insufficientAnswer());
  }

  switch (plan.intent) {
    case "bill-stage":
    case "bill-explain":
      return billQuestion(req, plan, data);
    case "bill-list":
      return listBills(req, plan, data);
    case "agenda":
      return currentAgenda(req, plan, data);
    case "vote":
      return voteQuestion(req, plan, data);
    case "member":
      return memberQuestion(req, plan, data);
    case "committee":
      return committeeQuestion(req, plan, data);
    case "session":
      return sessionQuestion(req, plan, data);
    default: {
      // "Энэ талаар дэлгэрэнгүй хэлээч" after a bill answer → explain that bill.
      const hinted = [req.selected, ...req.lastEntities, req.context].find((e) => e?.type === "bill" || e?.type === "bulletin");
      if (hinted && (plan.deictic || !plan.topics.length)) return billQuestion(req, { ...plan, intent: "bill-explain", wantsPurpose: true }, data);
      return broadSearch(req, plan, data);
    }
  }
}
