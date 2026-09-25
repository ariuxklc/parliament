import { amountsIn, englishNumbersIn, numbersIn, spelledNumbersIn } from "../parliament/text.ts";
import type { ChatCitation } from "./types.ts";
import { HELP_HOSTS } from "./help-directory.ts";

/**
 * Source registry for one answer. Tools register every official record they return and give the model
 * a short ref ("S4"); the model cites refs, and only refs registered here become links. The model never
 * writes URLs, so it cannot invent a link.
 */

export type SourceInfo = { title: string; url: string; publisher: string };

/** Hosts the assistant may link to. Every URL a tool registers is built by the server from these. */
export const OFFICIAL_HOSTS = new Set([
  "new.parliament.mn",
  "www.parliament.mn",
  "parliament.mn",
  "lawforum.parliament.mn",
  "legalinfo.mn",
  "petition.parliament.mn",
  "d.parliament.mn",
  "data.parliament.mn",
  // verified help services (lib/ai/help-directory.ts)
  ...HELP_HOSTS,
]);

export function isOfficialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && OFFICIAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export class SourceRegistry {
  private items: (SourceInfo & { ref: string })[] = [];
  private byKey = new Map<string, string>();

  add(source: SourceInfo): string | null {
    if (!isOfficialUrl(source.url)) return null;
    const key = `${source.url}|${source.title}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const ref = `S${this.items.length + 1}`;
    this.items.push({ ...source, title: source.title.slice(0, 200), ref });
    this.byKey.set(key, ref);
    return ref;
  }

  get(ref: string) {
    return this.items.find((s) => s.ref === ref);
  }

  all() {
    return [...this.items];
  }
}

// [S3], [S3, S5], [S3; S5], [S13–S21], 【S3】 — all normalised to numbered markers.
const REF = String.raw`S\d{1,3}(?:\s*[–—-]\s*S?\d{1,3})?`;
const MARKER = new RegExp(String.raw`[[【]\s*(${REF}(?:\s*[,;،]\s*${REF})*)\s*[\]】]`, "g");
const URL_RE = /https?:\/\/[^\s)\]]+/g;
const MAX_REFS_PER_MARKER = 6;

/** "S13–S16" → S13, S14, S15, S16 (capped). */
function expandRefs(group: string): string[] {
  return group.split(/\s*[,;،]\s*/).flatMap((part) => {
    const range = /^S(\d{1,3})\s*[–—-]\s*S?(\d{1,3})$/.exec(part);
    if (!range) return [part];
    const [from, to] = [Number(range[1]), Number(range[2])];
    if (to < from) return [`S${from}`];
    return Array.from({ length: Math.min(to - from + 1, MAX_REFS_PER_MARKER) }, (_, i) => `S${from + i}`);
  });
}

/**
 * Replace ref markers with [1], [2]… in order of first use; drop refs that were never registered;
 * remove raw URLs (links come only from the registry).
 */
export function resolveCitations(text: string, registry: SourceRegistry): { text: string; citations: ChatCitation[]; consulted: ChatCitation[] } {
  // One number per page: a law found by search and then read gets two refs but is one source.
  const numbers = new Map<string, number>();
  const citations: ChatCitation[] = [];
  const out = text
    .replace(URL_RE, "")
    .replace(MARKER, (_, group: string) => {
      const refs = expandRefs(group).slice(0, MAX_REFS_PER_MARKER);
      const nums: number[] = [];
      for (const ref of refs) {
        const source = registry.get(ref);
        if (!source) continue;
        let n = numbers.get(source.url);
        if (!n) {
          n = citations.length + 1;
          numbers.set(source.url, n);
          citations.push({ n, title: source.title, url: source.url, publisher: source.publisher });
        }
        if (!nums.includes(n)) nums.push(n);
      }
      return nums.map((n) => `[${n}]`).join("");
    })
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cited = new Set(citations.map((c) => c.url));
  const seen = new Set<string>();
  const consulted = registry
    .all()
    .filter((s) => !cited.has(s.url) && !seen.has(s.url) && seen.add(s.url))
    .slice(0, 8)
    .map((s) => ({ n: 0, title: s.title, url: s.url, publisher: s.publisher }));
  return { text: out, citations, consulted };
}

/**
 * Soft check: numbers the answer asserts (digits, and spelled-out numbers from 10 up) that appear in
 * none of the records retrieved for it, the question or the conversation. Flags, never deletes.
 */
export function hasUnverifiedNumbers(answer: string, corpus: string[]): boolean {
  const allowed = new Set(corpus.flatMap((t) => [...numbersIn(t), ...spelledNumbersIn(t), ...englishNumbersIn(t)]));
  const body = answer
    .replace(/\[\d+\]/g, " ")
    .replace(/^\s*\d+[.)]\s/gm, " "); // list numbering
  const claimed = [
    ...numbersIn(body).filter((n) => n !== "0"), // "0.25" yields a bare 0 that no source spells out
    ...[...spelledNumbersIn(body, { composedOnly: true }), ...englishNumbersIn(body)].filter((n) => Number(n) >= 10),
  ];
  if (claimed.some((n) => !allowed.has(n))) return true;

  // Amounts must match with their unit: "11 нэгж" is not backed by a source saying "арван (10) нэгж",
  // even if "11" appears elsewhere (e.g. in a date). Tögrög may be derived from units (1 нэгж = 1,000₮).
  const known = new Set(corpus.flatMap(amountsIn));
  return amountsIn(body).some((pair) => {
    if (known.has(pair)) return false;
    const [value, unit] = pair.split("|");
    const n = Number(value);
    return !(unit.startsWith("төгрөг") && n % 1000 === 0 && known.has(`${n / 1000}|нэгж`));
  });
}
