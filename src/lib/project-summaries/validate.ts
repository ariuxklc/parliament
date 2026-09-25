/**
 * Server-side checks on the model's brief. Pure.
 *
 * A statement survives only if it
 *  - cites at least one excerpt id that was actually given in this request (unknown ids are removed),
 *  - contains no URL / markup,
 *  - uses only numbers that appear in the excerpts it cites (or in the official title),
 *  - does not evaluate the project or advise the reader.
 * Only failing statements are dropped; the brief is rejected when no summary survives.
 */

import type { AffectedStatement, BriefStatement } from "./types.ts";

export const LIMITS = { summary: 4, mainChanges: 7, statedRationale: 3, affectedAreas: 5, keyPoints: 5 } as const;
type Section = keyof typeof LIMITS;

const MARKUP = /https?:\/\/|www\.|\]\(|<\/?[a-z][^>]*>|```/i;
const EVALUATIVE = /дэмжих\s+(?:хэрэгтэй|ёстой)|эсэргүүцэх\s+(?:хэрэгтэй|ёстой)|сайн\s+төсөл|муу\s+төсөл|зөв\s+шийдвэр|буруу\s+шийдвэр|та\s+(?:заавал|дэмж|эсэргүүц)/iu;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const MAX_TEXT = 420;

/** "10 000" / "10,000" → "10000" so formatting differences do not fail the number check. */
function normalizeNumbers(s: string): string {
  return s.replace(/(\d)[\s ,](?=\d{3}(?!\d))/g, "$1");
}

export function numbersGrounded(text: string, cited: string): boolean {
  const hay = normalizeNumbers(cited);
  return (normalizeNumbers(text).match(NUMBER) ?? []).every((n) => hay.includes(n));
}

export interface Dropped {
  section: Section;
  text: string;
  reason: "no-valid-refs" | "markup" | "ungrounded-number" | "evaluative" | "empty" | "too-long" | "duplicate" | "over-limit";
}

export interface ValidatedBrief {
  insufficientEvidence: boolean;
  summary: BriefStatement[];
  mainChanges: BriefStatement[];
  statedRationale: BriefStatement[];
  affectedAreas: AffectedStatement[];
  keyPoints: BriefStatement[];
  dropped: Dropped[];
}

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function validateBrief(raw: unknown, excerptText: Map<string, string>, title: string): ValidatedBrief {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dropped: Dropped[] = [];
  const seen = new Set<string>();

  const check = (section: Section, item: unknown): (BriefStatement & { who?: string }) | null => {
    const it = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const text = clean(it.text);
    if (!text) {
      dropped.push({ section, text: "", reason: "empty" });
      return null;
    }
    if (text.length > MAX_TEXT * 1.5) {
      dropped.push({ section, text, reason: "too-long" });
      return null;
    }
    if (MARKUP.test(text)) {
      dropped.push({ section, text, reason: "markup" });
      return null;
    }
    if (EVALUATIVE.test(text)) {
      dropped.push({ section, text, reason: "evaluative" });
      return null;
    }
    const refs = [...new Set((Array.isArray(it.refs) ? it.refs : []).map(clean).filter((r) => excerptText.has(r)))];
    if (!refs.length) {
      dropped.push({ section, text, reason: "no-valid-refs" });
      return null;
    }
    const cited = refs.map((r) => excerptText.get(r)!).join("\n") + "\n" + title;
    if (!numbersGrounded(text, cited)) {
      dropped.push({ section, text, reason: "ungrounded-number" });
      return null;
    }
    const key = text.toLocaleLowerCase("mn");
    if (seen.has(key)) {
      dropped.push({ section, text, reason: "duplicate" });
      return null;
    }
    seen.add(key);
    const who = clean(it.who).slice(0, 48);
    return { text: text.slice(0, MAX_TEXT), refs, ...(section === "affectedAreas" ? { who: who || "Иргэд" } : {}) };
  };

  const section = <T extends BriefStatement>(name: Section): T[] => {
    const items = Array.isArray(o[name]) ? (o[name] as unknown[]) : [];
    const ok = items.map((it) => check(name, it)).filter((x): x is BriefStatement & { who?: string } => x !== null);
    for (const extra of ok.slice(LIMITS[name])) dropped.push({ section: name, text: extra.text, reason: "over-limit" });
    return ok.slice(0, LIMITS[name]) as T[];
  };

  return {
    insufficientEvidence: o.insufficientEvidence === true,
    summary: section("summary"),
    mainChanges: section("mainChanges"),
    statedRationale: section("statedRationale"),
    affectedAreas: section<AffectedStatement>("affectedAreas"),
    keyPoints: section("keyPoints"),
    dropped,
  };
}
