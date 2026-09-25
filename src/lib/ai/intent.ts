import { topicTokens } from "../parliament/text.ts";

/**
 * Deterministic question analysis (no model call). It chooses which official sources to query;
 * it never produces facts. Patterns are Mongolian-first with a few English fallbacks.
 */
export type Intent =
  | "bill-explain" // what a bill says / changes / who it affects
  | "bill-stage" // where a bill is in the process, when it was submitted
  | "bill-list" // which bills match a topic/year, how many
  | "agenda" // what Parliament is discussing now
  | "vote" // voting results
  | "member" // a named MP
  | "committee" // a standing committee
  | "session" // sessions / sittings
  | "general";

export type QuestionPlan = {
  intent: Intent;
  years: number[];
  topics: string[];
  /** Refers to something already in context: "энэ төсөл", "уг хууль", "тэр санал хураалт". */
  deictic: boolean;
  recent: boolean;
  count: boolean;
  attendance: boolean;
  wantsFiles: boolean;
  wantsPurpose: boolean;
  wantsScope: boolean;
  clauseNumbers: string[];
  billIds: number[];
  stageFilter?: "drafting" | "submitted";
  typeFilter?: number;
  /** Person-name candidates as written ("Ц.Мөнхтуяа", "Мөнхтуяа"). */
  names: { initial?: string; name: string }[];
  /** Looks like an attempt to extract secrets or override instructions. */
  injection: boolean;
  /** Asks for a political recommendation, which the assistant does not give. */
  opinion: boolean;
};

const VOTE = /санал\s*хураа|санал\s*өгс|санал\s*өгөв|хэдэн\s*гишүүн\s*(?:дэмж|эсэргүүц|татгалз)|хэн\s*дэмж|дэмжсэн|эсэргүүцсэн|зөвшөөрсөн|татгалзсан|\bvot(?:e|ed|ing)\b/iu;
const STAGE = /шат|явц|хаана\s*(?:явж|байна|байгаа)|хэзээ\s*өргөн|өргөн\s*мэдүүлс[эн]*\s*(?:үү|огноо|өдөр)|хэлэлцэх\s*эсэх|анхны\s*хэлэлцүүлэг|эцсийн\s*хэлэлцүүлэг|батлагдсан\s*уу|баталсан\s*уу|батлагдах\s*уу|\bstage\b|\bstatus\b/iu;
const AGENDA = /хэлэлцэгдэж|хэлэлцэж\s*(?:байна|байгаа)|хэлэлцэх\s*(?:асуудал|гэж)|хуваарь|энэ\s*долоо\s*хоног|өнөөдөр|маргааш|\bagenda\b|\bschedule\b/iu;
const COMMITTEE = /байнгын\s*хороо|дэд\s*хороо|түр\s*хороо|\bcommittee\b/iu;
const MEMBER = /гишүүн\s+[А-ЯӨҮЁ]|[А-ЯӨҮЁ]\.\s?[А-ЯӨҮЁ][а-яөүё]{2,}|тойрог|аль\s*нам|ямар\s*нам|ирц|\bMP\b/u;
const SESSION = /чуулган|хуралдаан|\bsession\b|\bsitting\b/iu;
const LIST = /ямар\s*(?:ямар\s*)?(?:хуулийн\s*|тогтоолын\s*)?төсл(?:үүд|ийг)?|төслүүд|хуулиуд|хэдэн\s*(?:хуулийн\s*)?төсөл|жагсаа|бусад\s*төсөл|төстэй\s*төсөл|\bbills\b|how\s*many/iu;
const EXPLAIN = /юу\s*өөрчл|өөрчлөх\s*гэж|зорилго|юу\s*хийх|тайлбарла|агуулга|хамаарах|хэнд|ямар\s*заалт|гэж\s*юу|утга|яагаад|ач\s*холбогдол|хэрхэн\s*хамгаал|зохицуул|гол\s*санаа|\bexplain\b|\bpurpose\b/iu;
const BILL_WORD = /төс[өө]л|төсл|хууль|хуулий|тогтоол|\bbill\b|\blaw\b/iu;
const DEICTIC = /(?:^|\s)(?:энэ|тэр|уг|тус|дээрх|мөн|үүн|түүн)(?:\s|$|ий|ийг|ийн|тэй|д)|\bthis\b|\bthat\b|\bit\b/iu;
const RECENT = /сүүлийн|хамгийн\s*сүүл|сүүлд|одоо|шинээр|\blatest\b|\brecent/iu;
const INJECTION = /ignore\s+(?:all|any|previous|prior|the)|disregard\s+(?:all|previous)|system\s*prompt|developer\s*message|api[_\s-]?key|password|нууц\s*үг|token|\.env|credential|өмнөх\s*заавр|зааврыг\s*(?:үл|бүү|мартаж)|reveal\s+your|jailbreak/iu;
const OPINION = /дэмжих\s*ёстой|эсэргүүцэх\s*ёстой|санал\s*өгөх\s*ёстой|сонгох\s*ёстой|сайн\s*уу\s*муу|аль\s*нь\s*дээр|хэнийг\s*сонго|аль\s*нам\s*(?:дээр|зөв)|should\s+i\s+(?:support|vote)|who\s+should/iu;

const NAME_WITH_INITIAL = /([А-ЯӨҮЁ])\.\s?([А-ЯӨҮЁ][а-яөүё]{2,})/gu;
const CAPITALIZED = /(?<![\p{L}.])([А-ЯӨҮЁ][а-яөүё]{3,})/gu;
// Capitalized words that are not person names.
const NOT_NAMES = new Set(["улсын", "монгол", "их", "хурал", "хурлын", "засгийн", "газар", "ерөнхийлөгч", "энэ", "уг", "тус", "өгөгдлийн", "боловсролын", "сүүлийн", "одоо", "байнгын", "хууль", "хуулийн", "төсөл", "ямар", "хэдэн", "хэзээ", "хэн", "ардчилсан", "ардын", "нам", "намын"]);

export function analyzeQuestion(question: string): QuestionPlan {
  const q = question.trim();
  const years = [...new Set((q.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/g) ?? []).map(Number))].filter((y) => y >= 2000 && y <= 2100);
  const clauseNumbers = [...new Set(q.match(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){1,3}(?![\d.])/g) ?? [])];
  const billIds = [...new Set((q.match(/(?<![\d.])\d{3,6}(?![\d.])/g) ?? []).map(Number))].filter((n) => !years.includes(n));

  const names: QuestionPlan["names"] = [];
  for (const m of q.matchAll(NAME_WITH_INITIAL)) names.push({ initial: m[1], name: m[2] });
  if (!names.length && /гишүүн|гишүүний|\bMP\b/iu.test(q)) {
    for (const m of q.matchAll(CAPITALIZED)) if (!NOT_NAMES.has(m[1].toLocaleLowerCase("mn"))) names.push({ name: m[1] });
  }

  let intent: Intent = "general";
  if (VOTE.test(q)) intent = "vote";
  else if (names.length || MEMBER.test(q)) intent = names.length || /ирц|тойрог|нам/iu.test(q) ? "member" : "general";
  if (intent === "general") {
    if (STAGE.test(q)) intent = "bill-stage";
    else if (AGENDA.test(q) && !(DEICTIC.test(q) && BILL_WORD.test(q))) intent = "agenda";
    else if (COMMITTEE.test(q)) intent = "committee";
    else if (LIST.test(q) || (years.length && BILL_WORD.test(q) && !EXPLAIN.test(q))) intent = "bill-list";
    else if (EXPLAIN.test(q) || BILL_WORD.test(q)) intent = "bill-explain";
    else if (SESSION.test(q)) intent = "session";
  }

  const drafting = /санал\s*авч\s*буй|боловсруулж\s*буй|олон\s*нийтийн\s*саналд/iu.test(q);
  const submitted = /өргөн\s*мэдүүлсэн\s*төслүүд|өргөн\s*мэдүүлэгдсэн\s*төслүүд/iu.test(q);
  const nameWords = new Set(names.map((n) => n.name.toLocaleLowerCase("mn")));

  return {
    intent,
    years,
    topics: topicTokens(q).filter((t) => !nameWords.has(t)),
    deictic: DEICTIC.test(q),
    recent: RECENT.test(q),
    count: /хэдэн|хэд\s|нийт|тоо|how\s*many|count/iu.test(q),
    attendance: /ирц|ирсэн|тасалсан|attendance/iu.test(q),
    wantsFiles: /файл|баримт\s*бичиг|үзэл\s*баримтлал|танилцуулга|хавсралт|document/iu.test(q),
    wantsPurpose: /зорилго|юу\s*хийх|юу\s*өөрчл|өөрчлөх\s*гэж|гол\s*санаа|агуулга|тухай\s*юу|тайлбарла|purpose|what\s+does/iu.test(q),
    wantsScope: /хамаарах|хэнд|иргэд|үйлчлэх|хамрах|хэн\s*дагаж/iu.test(q),
    clauseNumbers,
    billIds,
    stageFilter: drafting ? "drafting" : submitted ? "submitted" : undefined,
    typeFilter: /тогтоол/iu.test(q) && !/хууль/iu.test(q) ? 2 : undefined,
    names,
    injection: INJECTION.test(q),
    opinion: OPINION.test(q),
  };
}
