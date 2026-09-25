import { numbersIn } from "../parliament/text.ts";
import { insufficientAnswer, joinPoints, withCitations } from "./compose.ts";
import type { ChatAnswer, Evidence } from "./types.ts";

/**
 * Server-side checks on the model's structured output. The model only ever sees request-local refs
 * (S1…S8); this maps them back to server-owned evidence and drops anything it cannot verify:
 *  - a statement citing a ref that was not given in this request (fabricated citation),
 *  - a statement with no citation,
 *  - a statement containing a number that does not appear in the sources it cites or in the question,
 *  - URLs / Markdown links in the text.
 * A valid ref is necessary, not sufficient: sentence-level faithfulness still needs human review.
 */

export type SourceRef = { ref: string; evidence: Evidence };

const MAX_POINTS = 6;
const MAX_POINT_CHARS = 700;
// Answers render as plain text (never HTML), so this only guards against model-made links.
const LINKISH = /https?:\/\/|www\.|\]\(|<a\s/i;
/**
 * Evidence kinds that identify a record the user may want to open even when the answer is insufficient.
 * Votes are excluded: they are found by keyword and are often unrelated when the model declines.
 */
const RECORD_KINDS = new Set(["bill", "bulletin", "member", "committee"]);

export type ValidationReport = { dropped: { reason: string; text: string }[] };

function grounded(text: string, allowed: Set<string>): boolean {
  return numbersIn(text).every((n) => allowed.has(n));
}

function numberSet(...values: string[]): Set<string> {
  return new Set(values.flatMap(numbersIn));
}

export function relatedRecords(refs: readonly SourceRef[]): Evidence[] {
  return refs.map((r) => r.evidence).filter((e) => RECORD_KINDS.has(e.kind));
}

export function validateModelAnswer(raw: unknown, refs: readonly SourceRef[], question: string, report: ValidationReport = { dropped: [] }): ChatAnswer {
  const related = relatedRecords(refs);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return insufficientAnswer({ related });
  const value = raw as Record<string, unknown>;
  if (typeof value.insufficientEvidence !== "boolean" || !Array.isArray(value.points)) return insufficientAnswer({ related });
  if (value.insufficientEvidence) return insufficientAnswer({ related });

  const byRef = new Map(refs.map((r) => [r.ref, r.evidence]));
  const questionNumbers = numberSet(question);
  const points: { text: string; sources: Evidence[] }[] = [];

  for (const item of value.points.slice(0, MAX_POINTS)) {
    if (!item || typeof item !== "object") continue;
    const { text, sourceIds } = item as { text?: unknown; sourceIds?: unknown };
    if (typeof text !== "string" || !Array.isArray(sourceIds)) continue;
    const clean = text.trim();
    if (!clean) continue;
    if (clean.length > MAX_POINT_CHARS || LINKISH.test(clean)) {
      report.dropped.push({ reason: "link-or-length", text: clean.slice(0, 120) });
      continue;
    }
    const ids = [...new Set(sourceIds.filter((id): id is string => typeof id === "string"))];
    if (!ids.length) {
      report.dropped.push({ reason: "uncited", text: clean.slice(0, 120) });
      continue;
    }
    if (ids.some((id) => !byRef.has(id))) {
      report.dropped.push({ reason: "unknown-source-id", text: clean.slice(0, 120) });
      continue;
    }
    const sources = ids.map((id) => byRef.get(id)!);
    const allowed = numberSet(...sources.map((s) => `${s.title} ${s.text}`));
    questionNumbers.forEach((n) => allowed.add(n));
    if (!grounded(clean, allowed)) {
      report.dropped.push({ reason: "ungrounded-number", text: clean.slice(0, 120) });
      continue;
    }
    points.push({ text: clean, sources });
  }

  if (!points.length) return insufficientAnswer({ related });

  let limitations = typeof value.limitations === "string" ? value.limitations.trim().slice(0, 400) : "";
  if (limitations && (LINKISH.test(limitations) || !grounded(limitations, numberSet(question, ...refs.map((r) => `${r.evidence.title} ${r.evidence.text}`))))) {
    report.dropped.push({ reason: "limitations", text: limitations.slice(0, 120) });
    limitations = "";
  }

  const cited = withCitations(points);
  return {
    status: "answered",
    mode: "ai",
    answer: joinPoints(cited.points, limitations || undefined),
    ...cited,
    limitations: limitations || undefined,
    insufficientEvidence: false,
    lastEntities: [],
  };
}
