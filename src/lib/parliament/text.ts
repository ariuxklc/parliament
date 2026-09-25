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
    "current latest recent bill bills law laws purpose explain stage status vote votes session sessions member members committee committees which what how many the of in on a to is are about this that"
  ).split(/\s+/),
);

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
