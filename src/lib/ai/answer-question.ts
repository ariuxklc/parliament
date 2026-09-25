import type { ParliamentData } from "../parliament/records.ts";
import { normalize, questionLanguage } from "../parliament/text.ts";
import { retrieve, type Retrieval } from "./retrieve.ts";
import { sanitizeHints } from "./understand.ts";
import { validateModelAnswer, type SourceRef, type ValidationReport } from "./validate-answer.ts";
import type { ChatAnswer, ChatRequest } from "./types.ts";

/**
 * Ask Parliament AI pipeline:
 *   question → retrieve official evidence (or answer/clarify directly from structured data)
 *            → [only if routing is weak] model reads the QUESTION ONLY and returns a search plan → retrieve again
 *            → model explains ONLY the retrieved evidence → server validates refs & numbers → answer + trusted links.
 * Pure: the data source and both model calls are injected, so tests run offline.
 */

/** Exactly what the answering model is shown. No URLs, IDs of real records, keys or credentials. */
export type ModelInput = {
  question: string;
  /** The question as understood after spelling correction or translation to Mongolian, when that step ran. */
  interpretedQuestion: string | null;
  /** Language to write the explanation in: the user's language. */
  answerLanguage: "Mongolian" | "English";
  conversation: { role: "user" | "assistant"; content: string }[];
  focus: string | null;
  serverNotes: string[];
  sources: { id: string; publisher: string; title: string; text: string }[];
};

export type GenerateAnswer = (input: ModelInput) => Promise<unknown>;
/** Question understanding sees the question and the previous user question — nothing else. */
export type UnderstandQuestion = (input: { question: string; previousQuestion: string | null }) => Promise<unknown>;

const HISTORY_TURNS = 4;
const HISTORY_CHARS = 400;

/** Understanding helps messy, conversational or legal-situation questions; it is skipped where routing is already certain. */
function needsUnderstanding(r: Retrieval): boolean {
  if (r.kind === "answer") {
    if (r.reason) return false; // policy refusal, injection, off-topic
    if (r.answer.status === "clarify" || r.answer.mode === "data") return false;
    return r.answer.status === "insufficient";
  }
  return r.plan.legal || r.plan.intent === "general";
}

export async function answerQuestion(
  req: ChatRequest,
  data: ParliamentData,
  generate: GenerateAnswer,
  report?: ValidationReport,
  understand?: UnderstandQuestion,
): Promise<ChatAnswer> {
  // Refusal checks (injection, political opinion) always run on the user's own words first.
  let retrieval = await retrieve(req, data);
  let understood: string | undefined;
  // Official records are Mongolian, so an English question is translated before searching.
  const english = questionLanguage(req.question) === "en";
  const refused = retrieval.kind === "answer" && !!retrieval.reason;

  if (understand && !refused && (english || needsUnderstanding(retrieval))) {
    const previousQuestion = [...req.history].reverse().find((t) => t.role === "user")?.content.slice(0, 300) ?? null;
    let raw: unknown = null;
    try {
      raw = await understand({ question: req.question, previousQuestion });
    } catch {
      raw = null; // understanding is an optimisation; the deterministic result stands
    }
    const hints = sanitizeHints(raw, req.question);
    if (hints) {
      const retried = await retrieve({ ...req, question: hints.correctedQuestion }, data, { ...hints, english });
      // Prefer the retry unless it lost evidence the first pass had. An English first pass never counts:
      // it matched English words against Mongolian records.
      if (english || retried.kind === "evidence" || retrieval.kind === "answer") retrieval = retried;
      if (normalize(hints.correctedQuestion) !== normalize(req.question)) understood = hints.correctedQuestion;
    }
  }

  const extras = { help: retrieval.help, understood };
  if (retrieval.kind === "answer") {
    const fixed = { ...retrieval.answer, ...extras };
    return english ? inEnglish(fixed, retrieval.reason) : fixed;
  }

  const refs: SourceRef[] = retrieval.evidence.map((evidence, i) => ({ ref: `S${i + 1}`, evidence }));
  const input: ModelInput = {
    question: req.question,
    interpretedQuestion: understood ?? null,
    answerLanguage: english ? "English" : "Mongolian",
    // Earlier AI answers are context for pronouns only; the instructions forbid using them as facts.
    conversation: req.history.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, content: t.content.slice(0, HISTORY_CHARS) })),
    focus: retrieval.focus ? `«${retrieval.focus.title}»` : null,
    serverNotes: retrieval.notes,
    sources: refs.map(({ ref, evidence }) => ({ id: ref, publisher: evidence.publisher, title: evidence.title, text: evidence.text })),
  };

  const raw = await generate(input);
  // Numbers may come only from the user's own words or the cited sources — never from the interpretation.
  const validated = validateModelAnswer(raw, refs, req.question, report);
  const result = { ...validated, lastEntities: retrieval.entities, focus: retrieval.focus, ...extras };
  return english ? inEnglish(result) : result;
}

/**
 * Fixed server messages (refusals, clarifications) in English for English questions. Model-written
 * explanations are already in English; answers built from official records keep their official Mongolian wording.
 */
function inEnglish(a: ChatAnswer, reason?: string): ChatAnswer {
  if (a.mode !== "none") return a;
  const text =
    reason === "policy"
      ? "Ask Parliament AI does not give political recommendations or say whether to support a bill, party or member. It can find and explain official information: what a bill contains, where it is in the process, and how votes went."
      : a.status === "clarify"
        ? a.choices?.length
          ? "Several official records match your question. Please choose the one you mean."
          : "Please say which bill or member you mean, by name — for example: “What stage is the Data bill at?”"
        : reason === "off_topic"
          ? "The official sources Ask Parliament AI uses don't contain enough reliable information to answer this. Ask Parliament AI covers Parliament and legislation."
          : "The official sources Ask Parliament AI uses don't contain enough reliable information to answer this.";
  return { ...a, answer: text, points: [{ text, citations: [] }] };
}
