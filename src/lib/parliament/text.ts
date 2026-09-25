/**
 * Mongolian-aware lexical helpers for retrieval (pure, browser/Node safe, no dependencies).
 *
 * Mongolian is agglutinative and drops "fleeting" vowels when inflecting
 * (өгөгдөл → өгөгдлийн, төсөв → төсвийн), so exact word matching misses most real questions.
 * We strip common case suffixes, then compare stems by prefix or by consonant skeleton.
 * This is deliberately simple: it ranks candidates; it never decides facts.
 */

const VOWEL = /[аэиоуөүыеёюя]/;

// Longest first. Case endings, plural markers and common derivational endings seen in bill titles/questions.
const SUFFIXES = [
  "уудын", "үүдийн", "уудад", "үүдэд", "уудыг", "үүдийг", "чуудын", "чүүдийн",
  "гийнх", "гийн", "ийнх", "ийг", "ийн", "ын", "ний", "ны", "ыг", "ийд", "ад", "эд", "од", "өд",
  "аас", "ээс", "оос", "өөс", "гаас", "гээс", "тай", "тэй", "той", "аар", "ээр", "оор", "өөр",
  "уудтай", "үүдтэй", "ууд", "үүд", "чууд", "чүүд", "нар", "нэр",
  // verb endings: цуглуулах / цуглуулна / цуглуулсан / цуглуулж → цуглуул
  "жээ", "чээ", "лаа", "лээ", "лоо", "лөө", "аад", "ээд", "оод", "өөд", "сан", "сэн", "сон", "сөн",
  "ах", "эх", "ох", "өх", "на", "нэ", "но", "нө", "ж",
  "д", "т", "г",
];

/** Words that carry no topic information in Parliament questions. Compared after lowercasing. */
export const STOPWORDS = new Set(
  (
    "энэ тэр тэдгээр эдгээр тухайн түүний үүний үүнтэй түүнтэй уг тус дээрх мөн тухай төсөл төслийн төслийг төслөөр төсөлд төслүүд төслүүдийн төслүүдийг " +
    "хуулийн хууль хуулийг хуулиуд хуулиудын хуульд тогтоол тогтоолын тогтоолыг ямар ямархуу юу юун юуг юунд гэж гэдэг гэсэн байгаа байна байсан байдаг байх " +
    "вэ бэ уу үү нь бол болон ба буюу холбоотой холбогдох холбоо сүүлийн сүүлд сүүлийнх үед үеийн шинэ шинээр одоо одоогийн хамгийн талаар " +
    "хэдэн хэд нийт тоо оны онд он жил жилд жилийн сард сар намрын хаврын чуулганаар чуулганы чуулган чуулганд гишүүн гишүүний гишүүд гишүүдийн " +
    "уих улсын их хурлын хурал хурлаар надад бидэнд энгийнээр энгийн тайлбарла тайлбарлах тайлбарлаж тайлбар зорилго зорилгыг гол өөрчлөх өөрчлөлт өөрчлөлтийг " +
    "хийх хийгдэж хийсэн шат шатанд шатандаа шатны явц явцад явж явагдаж хэрхэн яаж хэнд иргэдэд иргэд хамаарах хамаардаг хамрах хүрээ үндсэн санаа " +
    "өгөх өгөөч өгнө үү дэмжсэн эсэргүүцсэн санал хураалт хураалтын хураалтууд хураасан үр дүн дүнг дүнтэй хороонд байнгын хороо хорооны " +
    "бүртгэл бүртгэгдсэн эсэх төстэй өөр бусад жагсаа жагсаалт харуул мэдээлэл мэдээллийг мэдэх хүсэж хүсч байна вэ хэлэлцэгдэж хэлэлцэж хэлэлцсэн хэлэлцэх " +
    "хэлэлцүүлэг хэлэлцүүлэгт хэлэлцүүлгийн асуудал асуудлууд асуудлыг өргөн мэдүүлсэн мэдүүлэгдсэн батлагдсан баталсан батлах хэзээ хаана хэн хэний " +
    "хамт холбогдуулан боловсруулсан анхдагч төслүүдийг өөрчилсөн гарсан орсон дахь дэх ямар ямарууд " +
    "би миний намайг над чи та таны байгаад байхад байсаар яах яаж яагаад яана болох болсон гээд гэхэд юм юмаа уу үү ээ " +
    "current latest recent bill bills law laws purpose explain stage status vote votes session sessions member members committee committees which what how many the of in on a to is are about this that"
  ).split(/\s+/),
);

/**
 * "en" when a question is written mostly in Latin letters. Retrieval matches Mongolian official text,
 * so such questions are translated to Mongolian before searching.
 */
export function questionLanguage(value: string): "mn" | "en" {
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  const cyrillic = (value.match(/[Ѐ-ӿ]/g) ?? []).length;
  return latin >= 3 && latin > cyrillic ? "en" : "mn";
}

/** Lowercase, unify quotes/dashes, collapse whitespace. */
export function normalize(value: string): string {
  return value
    .toLocaleLowerCase("mn")
    .replace(/ё/g, "е")
    .replace(/[“”„«»"'`’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Letter/digit tokens of length ≥ 2 (digits kept separately by callers that need them). */
export function tokens(value: string): string[] {
  return normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Topic tokens: no stopwords, no pure numbers, length ≥ 3. */
export function topicTokens(value: string): string[] {
  return tokens(value).filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export function stem(word: string): string {
  const w = normalize(word);
  for (const suffix of SUFFIXES) {
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** True when two words are plausibly inflections of the same stem. */
export function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return true;
  // The shared prefix must cover almost all of the shorter stem: боловсрол ≠ боловсруулах, өгөгдл = өгөгдөл.
  const shorter = Math.min(sa.length, sb.length);
  if (shorter >= 5 && commonPrefix(sa, sb) >= Math.max(5, shorter - 1)) return true;
  if (Math.min(sa.length, sb.length) >= 4 && (sa.startsWith(sb) || sb.startsWith(sa))) return true;
  // Fleeting vowel: deleting exactly one vowel from the longer stem gives the shorter one
  // (төсөв → төсв, өгөгдөл → өгөгдл), but боловсрол ≠ боловсруул.
  if (Math.min(sa.length, sb.length) < 4 || Math.abs(sa.length - sb.length) !== 1) return false;
  const [longer, shorterStem] = sa.length > sb.length ? [sa, sb] : [sb, sa];
  for (let i = 1; i < longer.length; i++) {
    if (VOWEL.test(longer[i]) && longer.slice(0, i) + longer.slice(i + 1) === shorterStem) return true;
  }
  return false;
}

/** Small hand-checked topic expansions so "боловсролтой холбоотой" also finds school-related bills. */
const TOPIC_EXPANSIONS: [RegExp, string[]][] = [
  [/^боловсрол/, ["боловсрол", "сургууль", "сургалт", "багш", "их сургууль"]],
  [/^эрүүл|^эмнэлг/, ["эрүүл", "эмнэлэг", "эм"]],
  [/^татвар/, ["татвар"]],
  [/^өгөгд/, ["өгөгдөл"]],
  [/^байгал|^орчин/, ["байгаль", "орчин"]],
  [/^эрчим/, ["эрчим", "цахилгаан"]],
  [/^төсв|^төсөв/, ["төсөв", "төсвийн"]],
  [/^хүүхд|^хүүхэд/, ["хүүхэд", "хүүхдийн"]],
  [/^газр|^газар/, ["газар", "газрын"]],
];

export function expandTopics(topics: string[]): string[] {
  const out = new Set(topics);
  for (const topic of topics) {
    for (const [pattern, extra] of TOPIC_EXPANSIONS) if (pattern.test(topic)) extra.forEach((e) => out.add(e));
  }
  return [...out];
}

/**
 * Lexical match score between query topics and a title.
 * `coverage` = share of the title's topic tokens the query mentions (1.0 = the query names the title exactly);
 * `hits` = number of query topics found in the title.
 */
export function titleMatch(queryTopics: string[], title: string): { hits: number; coverage: number } {
  const titleTopics = [...new Set(topicTokens(title))];
  if (!titleTopics.length || !queryTopics.length) return { hits: 0, coverage: 0 };
  const hits = queryTopics.filter((q) => titleTopics.some((t) => similar(q, t))).length;
  const covered = titleTopics.filter((t) => queryTopics.some((q) => similar(q, t))).length;
  return { hits, coverage: covered / titleTopics.length };
}

/** Count query topics present anywhere in a passage (for ranking clauses/records). */
export function passageHits(queryTopics: string[], text: string): number {
  const words = [...new Set(tokens(text).filter((t) => t.length >= 3))];
  return queryTopics.filter((q) => words.some((w) => similar(q, w))).length;
}

/** Digits in a string, with leading zeros removed ("2026.07.03" → ["2026","7","3"]). */
export function numbersIn(value: string): string[] {
  return (value.match(/\d+/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, ""));
}

// Mongolian number words (standalone and attributive forms). Exact tokens only: "нэгж" (unit) is not "нэг".
const NUMBER_WORDS: Record<string, number> = {
  нэг: 1, нэгэн: 1, хоёр: 2, хоер: 2, гурав: 3, гурван: 3, дөрөв: 4, дөрвөн: 4, тав: 5, таван: 5, зургаа: 6, зургаан: 6,
  долоо: 7, долоон: 7, найм: 8, найман: 8, ес: 9, есөн: 9, арав: 10, арван: 10, хорь: 20, хорин: 20, гуч: 30, гучин: 30,
  дөч: 40, дөчин: 40, тавь: 50, тавин: 50, жар: 60, жаран: 60, дал: 70, далан: 70, ная: 80, наян: 80, ер: 90, ерэн: 90,
};
const MULTIPLIERS: Record<string, number> = { зуу: 100, зуун: 100, мянга: 1000, мянган: 1000 };

/**
 * Numbers written in words in official text ("тавин нэгжтэй тэнцэх", "хорин таван хоног") as digits,
 * so a statement saying "50 нэгж" is recognised as grounded in a source that says "тавин нэгж".
 */
export function spelledNumbersIn(value: string, opts: { composedOnly?: boolean } = {}): string[] {
  const out = new Set<string>();
  let total = 0;
  let group = 0;
  const flush = () => {
    if (total + group > 0) out.add(String(total + group));
    total = 0;
    group = 0;
  };
  for (const token of tokens(value)) {
    if (token in NUMBER_WORDS) {
      group += NUMBER_WORDS[token];
      if (!opts.composedOnly) out.add(String(NUMBER_WORDS[token]));
    } else if (token in MULTIPLIERS) {
      const m = MULTIPLIERS[token];
      if (m === 1000) {
        total = (total + (group || 1)) * m;
        group = 0;
      } else group = (group || 1) * m;
      if (!opts.composedOnly) out.add(String(m));
    } else flush();
  }
  flush();
  return [...out];
}

const NUMBER_WORD_ALT = [...Object.keys(NUMBER_WORDS), ...Object.keys(MULTIPLIERS)].sort((a, b) => b.length - a.length).join("|");
const UNIT_ALT = "нэгж|төгрөг|хувь|хоног|сар|жил|цаг";
const SPELLED_AMOUNT = new RegExp(`(?<![\\p{L}])((?:(?:${NUMBER_WORD_ALT})\\s+)+)(${UNIT_ALT})`, "giu");

/**
 * Write the digits next to amounts spelled out in official text: "арван нэгжтэй" → "арван (10) нэгжтэй".
 * The wording stays verbatim; the digits stop "арван нэгж" (10 units) being misread as "арван нэг" (11).
 */
export function annotateSpelledAmounts(text: string): string {
  return text.replace(SPELLED_AMOUNT, (match, nums: string, unit: string) => {
    const value = spelledNumbersIn(nums, { composedOnly: true })[0];
    return value ? `${nums.trimEnd()} (${value}) ${unit}` : match;
  });
}

/** "value|unit" amounts in a text, from digits ("400 нэгж", "(10) нэгжтэй") and spelled numbers ("тавин нэгж"). */
export function amountsIn(value: string): string[] {
  const out: string[] = [];
  const digits = new RegExp(`(\\d{1,3}(?:[ ,\\u00a0]\\d{3})+|\\d+)\\)?\\s*(${UNIT_ALT})`, "giu");
  for (const m of value.matchAll(digits)) out.push(`${Number(m[1].replace(/[ , ]/g, ""))}|${m[2].toLocaleLowerCase("mn")}`);
  for (const m of value.matchAll(SPELLED_AMOUNT)) {
    const n = spelledNumbersIn(m[1], { composedOnly: true })[0];
    if (n) out.push(`${n}|${m[2].toLocaleLowerCase("mn")}`);
  }
  return out;
}

const EN_SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const EN_SCALE: Record<string, number> = { hundred: 100, thousand: 1_000, million: 1_000_000 };

/** English number words as whole values: "fifty-one" → 51, "one hundred and twenty" → 120. */
export function englishNumbersIn(value: string): string[] {
  const out = new Set<string>();
  const words = value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let total = 0;
  let group = 0;
  let active = false;
  const flush = () => {
    if (active) out.add(String(total + group));
    total = 0;
    group = 0;
    active = false;
  };
  words.forEach((w, i) => {
    if (w in EN_SMALL) {
      group += EN_SMALL[w];
      active = true;
    } else if (w in EN_SCALE) {
      if (EN_SCALE[w] === 100) group = (group || 1) * 100;
      else {
        total += (group || 1) * EN_SCALE[w];
        group = 0;
      }
      active = true;
    } else if (w === "and" && active && (words[i + 1] ?? "") in EN_SMALL) {
      // "one hundred and twenty": keep the number going
    } else flush();
  });
  flush();
  return [...out];
}
