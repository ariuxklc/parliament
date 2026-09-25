import "server-only";
import { createHash } from "node:crypto";
import { parliamentData } from "../parliament/data";
import type { LawForumClause } from "../parliament/lawforum-page";
import { cleanText } from "../format";
import type { BillExplainer, ImpactPoint, SourcePassage, SummaryPoint } from "./types";
import { getExplainer, saveExplainer } from "./store";

/**
 * Drafts a plain-language explainer for one bill with the project's model (OPENAI_MODEL, "gpt-6-luna").
 * The model sees only the bill title/type and numbered passages of the official LawForum text — no URLs,
 * no tools. The server then keeps only statements that cite given passages and whose numbers appear in
 * those passages. The result is saved as a DRAFT; a person must approve it in /review before it is public.
 */

export class ExplainerError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_PASSAGES = 36;
const MAX_CHARS = 12_000;
const IMPACT_WORDS = /иргэн|хүн|эрх|үүрэг|хориглох|хариуцлага|торгу|төлбөр|хэрэглэгч|оюутан|сурагч|ажилтан|ажил олгогч|аж ахуйн нэгж|байгууллага|зөвшөөрөл|мэдээлэл|хамгаал/i;

/** Purpose/scope articles first (what the law is), then clauses that mention people, rights and duties. */
function selectPassages(clauses: LawForumClause[]): SourcePassage[] {
  const body = clauses.filter((c) => !c.isHeading && c.text.length > 20);
  const articleNo = (c: LawForumClause) => Number(/^(\d+)/.exec(c.number)?.[1] ?? /^(\d+)/.exec(c.article)?.[1] ?? 99);
  const early = body.filter((c) => articleNo(c) <= 3);
  const impact = body.filter((c) => articleNo(c) > 3 && IMPACT_WORDS.test(c.text));
  const rest = body.filter((c) => !early.includes(c) && !impact.includes(c));
  const picked: LawForumClause[] = [];
  let chars = 0;
  for (const c of [...early, ...impact, ...rest]) {
    if (picked.length >= MAX_PASSAGES) break;
    const text = cleanText(c.text).slice(0, 700);
    if (chars + text.length > MAX_CHARS) continue;
    picked.push({ ...c, text });
    chars += text.length;
  }
  // keep document order so the model reads the bill as written
  picked.sort((a, b) => clauses.indexOf(a) - clauses.indexOf(b));
  return picked.map((c, i) => ({ ref: `S${i + 1}`, anchor: c.anchor, number: c.number, article: cleanText(c.article), text: c.text }));
}

const INSTRUCTIONS = `Чи Монгол Улсын Их Хурлын хуулийн төслийг 20–30 насны иргэдэд ойлгомжтой тайлбарладаг туслах.
Зөвхөн өгөгдсөн эх бичвэрийн хэсгүүдэд (S1, S2 …) тулгуурла. Гаднын мэдлэг, таамаг, үнэлгээ бүү нэм.

Гаргах зүйл:
1) summary — энэ төсөл юу хийх гэж байгааг 2–4 богино өгүүлбэрээр (өгүүлбэр бүр 25 үгээс бага). Энгийн, өдөр тутмын хэллэг. Хуулийн нэр томьёог шаардлагатай бол энгийнээр тайлбарла.
2) impact — "Энэ танд хамаатай юу?": эх бичвэрт тодорхой харагдаж буй 1–3 бүлэг хүмүүс (жишээ: "Иргэд", "Оюутан, залуус", "Байгууллагууд") ба тэдэнд юу өөрчлөгдөхийг нэг өгүүлбэрээр. Эх бичвэр тодорхой заагаагүй бол бүү зохио — цөөн эсвэл хоосон байж болно.

Заавал:
- Өгүүлбэр бүрт refs-д холбогдох S дугаар(ууд)ыг бич. Эх сурвалжгүй өгүүлбэр бүү бич.
- Тоо, огноо, хувь зөвхөн иш татсан хэсэгт яг байгаа бол л бич.
- Энэ бол төсөл — "батлагдсан хууль" гэж бүү бич; "төсөлд … гэж заажээ/санал болгож байна" гэх мэт.
- Төвийг сахи: дэмжих, эсэргүүцэх, сайн/муу гэж үнэлэх, зөвлөгөө өгөх, хэтийн таамаг дэвшүүлэхийг хориглоно.
- Эх бичвэр хэт богино эсвэл ойлгомжгүй бол insufficient = true.
Хариултыг зөвхөн JSON схемээр, монгол хэлээр өг.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insufficient", "summary", "impact"],
  properties: {
    insufficient: { type: "boolean" },
    summary: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text", "refs"], properties: { text: { type: "string" }, refs: { type: "array", items: { type: "string" } } } },
    },
    impact: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["who", "text", "refs"],
        properties: { who: { type: "string" }, text: { type: "string" }, refs: { type: "array", items: { type: "string" } } },
      },
    },
  },
} as const;

interface ModelOut {
  insufficient: boolean;
  summary: SummaryPoint[];
  impact: ImpactPoint[];
}

async function callLuna(input: unknown): Promise<ModelOut | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ExplainerError(503, "AI үйлчилгээ тохируулагдаагүй байна (OPENAI_API_KEY).");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 3_000,
      instructions: INSTRUCTIONS,
      safety_identifier: createHash("sha256").update("bill-explainer").digest("hex").slice(0, 32),
      input: [{ role: "user", content: JSON.stringify(input) }],
      text: { format: { type: "json_schema", name: "bill_explainer", strict: true, schema: SCHEMA } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  }).catch((e: unknown) => {
    throw new ExplainerError(504, e instanceof Error && e.name === "TimeoutError" ? "AI хариулт хэт удлаа." : "AI үйлчилгээтэй холбогдож чадсангүй.");
  });
  if (!res.ok) {
    console.warn(`[explainer] OpenAI HTTP ${res.status}`); // status only — never bodies or headers
    throw new ExplainerError(res.status === 429 ? 429 : 503, "AI үйлчилгээ түр боломжгүй байна.");
  }
  const body = (await res.json()) as { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (body.status !== "completed") throw new ExplainerError(502, "AI хариулт дуусаагүй байна. Дахин оролдоно уу.");
  const parts = body.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []) ?? [];
  if (parts.some((p) => p.type === "refusal")) return null;
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
  try {
    return JSON.parse(text) as ModelOut;
  } catch {
    throw new ExplainerError(502, "AI хариултыг уншиж чадсангүй.");
  }
}

const NUMBER = /\d+(?:[.,]\d+)*/g;

/** Keep a statement only if it cites known passages and every number in it appears in those passages. */
function grounded<T extends SummaryPoint>(points: T[] | undefined, byRef: Map<string, SourcePassage>, title: string, max: number): T[] {
  return (points ?? [])
    .map((p) => ({ ...p, text: cleanText(p.text).slice(0, 320), refs: [...new Set((p.refs ?? []).filter((r) => byRef.has(r)))] }))
    .filter((p) => {
      if (!p.text || !p.refs.length) return false;
      const cited = p.refs.map((r) => `${byRef.get(r)!.number} ${byRef.get(r)!.text}`).join(" ") + " " + title;
      return (p.text.match(NUMBER) ?? []).every((n) => cited.includes(n));
    })
    .slice(0, max);
}

export async function generateExplainer(billId: number): Promise<BillExplainer> {
  const bill = (await parliamentData.bills()).find((b) => b.id === billId);
  if (!bill) throw new ExplainerError(404, "LawForum-д ийм дугаартай төсөл олдсонгүй.");
  const doc = await parliamentData.billDocument(bill);
  if (!doc?.clauses.length) throw new ExplainerError(422, "Төслийн эх бичвэрийг LawForum-аас уншиж чадсангүй.");

  const passages = selectPassages(doc.clauses);
  if (passages.length < 2) throw new ExplainerError(422, "Тайлбар бэлтгэхэд хангалттай эх бичвэр алга.");
  const byRef = new Map(passages.map((p) => [p.ref, p]));

  const out = await callLuna({
    bill: { title: bill.title, type: bill.typeTitle, listing: bill.stage === "submitted" ? "Өргөн мэдүүлсэн төсөл" : "Олон нийтээс санал авч буй төсөл" },
    passages: passages.map((p) => ({ ref: p.ref, clause: p.number || null, article: p.article, text: p.text })),
  });
  if (!out || out.insufficient) throw new ExplainerError(422, "Эх бичвэрээс найдвартай тайлбар гаргах боломжгүй байна.");

  const summary = grounded(out.summary, byRef, bill.title, 4);
  const impact = grounded(out.impact, byRef, bill.title, 3).map((p) => ({ ...p, who: cleanText(p.who).slice(0, 40) || "Иргэд" }));
  if (!summary.length) throw new ExplainerError(422, "Эх сурвалжаар баталгаажсан тайлбар үлдсэнгүй. Дахин оролдоно уу.");

  const usedRefs = new Set([...summary, ...impact].flatMap((p) => p.refs));
  const now = new Date().toISOString();
  const previous = await getExplainer(billId);
  const saved = await saveExplainer(billId, () => ({
    billId,
    billTitle: bill.title,
    billUrl: bill.url,
    status: "draft", // never auto-published
    summary,
    impact,
    sources: passages.filter((p) => usedRefs.has(p.ref)),
    video: previous?.video ?? null,
    generatedAt: now,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
    editedByReviewer: false,
    reviewedBy: null,
    approvedAt: null,
    updatedAt: now,
  }));
  return saved!;
}
