/**
 * Display casing for official titles that arrive in ALL CAPS (LawForum, petitions, Цахим парламент).
 * The words are unchanged; only the casing is turned into ordinary sentence case, which is far easier
 * to read in a list. Titles that are already mixed-case are returned untouched.
 */

/** Acronyms that must stay upper case (checked on the part before any "-suffix"). */
const ACRONYMS = new Set([
  "УИХ", "ХК", "ХХК", "ТӨК", "ТӨХК", "ТББ", "НҮБ", "ОУВС", "АНУ", "ОХУ", "БНХАУ", "ЕХ", "ДЭМБ", "ОУХБ",
  "НӨАТ", "ХХОАТ", "ААН", "ЖДҮ", "НДШ", "ҮАБЗ", "ИТХ", "ЗДТГ", "ЦЕГ", "ШШГЕГ", "ГХЯ", "ХЗДХЯ", "СЯ", "ЭМЯ",
  "БШУЯ", "ЗТХЯ", "УИХ-ЫН", "МУ", "ЗГ", "ГЕГ", "ТЕГ", "МХЕГ", "ХНН", "ЭЗБХ", "ОУ", "АХБ", "ДБ", "ICT", "IT",
  "AI", "COVID", "ESG", "NGO", "API",
]);

/** Proper names that keep their capitals after lower-casing. */
const PHRASES: [RegExp, string][] = [
  [/монгол улс/g, "Монгол Улс"],
  [/улсын их хурал/g, "Улсын Их Хурал"],
  [/засгийн газар/g, "Засгийн газар"],
  [/үндсэн хуул/g, "Үндсэн хуул"],
  [/ерөнхийлөгч/g, "Ерөнхийлөгч"],
  [/улаанбаатар/g, "Улаанбаатар"],
  [/үндсэн хуулийн цэц/g, "Үндсэн хуулийн цэц"],
];

function isShouting(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 6) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return upper / letters.length > 0.7;
}

function lowerChunk(chunk: string): string {
  return chunk
    .split(/(\s+)/)
    .map((word) => {
      const bare = word.replace(/^[«“"'(\[]+|[»”"'),.:;\]]+$/g, "");
      const stem = bare.split("-")[0];
      if (ACRONYMS.has(bare) || ACRONYMS.has(stem) || /^[IVXLC]+$/.test(bare) || /\d/.test(stem)) {
        // keep the acronym, lower-case only a grammatical suffix: "ХК-ИЙН" → "ХК-ийн"
        return word.replace(/-(\p{L}+)/gu, (_, s: string) => `-${s.toLowerCase()}`);
      }
      return word.toLowerCase();
    })
    .join("");
}

export function readableTitle(title: string): string {
  if (!title) return title;
  // Casing is judged per chunk, so "ХОТЫН ОЙ … ТУХАЙ (Анхдагч хуулийн төсөл)" and "… ТУХАЙ /Шинэчилсэн найруулга/" are fixed too.
  const chunks = title.split(/(\([^)]*\)|\/[^/]*\/)/);
  if (!chunks.some(isShouting)) return title;
  let out = chunks.map((c) => (isShouting(c) ? lowerChunk(c) : c)).join("");
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  // capital after an opening quote (names of programmes, companies, treaties)
  out = out.replace(/([«“"])(\p{Ll})/gu, (_, q: string, c: string) => q + c.toUpperCase());
  return out.replace(/^(\P{L}*)(\p{Ll})/u, (_, pre: string, c: string) => pre + c.toUpperCase());
}
