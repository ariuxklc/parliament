import type { ParliamentData } from "../parliament/records.ts";
import { retrieve } from "./retrieve.ts";
import { validateModelAnswer, type SourceRef, type ValidationReport } from "./validate-answer.ts";
import type { ChatAnswer, ChatRequest } from "./types.ts";

/**
 * Ask Parliament AI pipeline:
 *   question → retrieve official evidence (or answer/clarify directly from structured data)
 *            → model explains ONLY that evidence → server validates refs & numbers → answer + trusted links.
 * Pure: the data source and the model are injected, so tests run offline.
 */

/** Exactly what the model is shown. No URLs, IDs of real records, keys or credentials. */
export type ModelInput = {
  question: string;
  conversation: { role: "user" | "assistant"; content: string }[];
  focus: string | null;
  serverNotes: string[];
  sources: { id: string; publisher: string; title: string; text: string }[];
};

export type GenerateAnswer = (input: ModelInput) => Promise<unknown>;

const HISTORY_TURNS = 4;
const HISTORY_CHARS = 400;

export async function answerQuestion(req: ChatRequest, data: ParliamentData, generate: GenerateAnswer, report?: ValidationReport): Promise<ChatAnswer> {
  const retrieval = await retrieve(req, data);
  if (retrieval.kind === "answer") return retrieval.answer;

  const refs: SourceRef[] = retrieval.evidence.map((evidence, i) => ({ ref: `S${i + 1}`, evidence }));
  const input: ModelInput = {
    question: req.question,
    // Earlier AI answers are context for pronouns only; the instructions forbid using them as facts.
    conversation: req.history.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, content: t.content.slice(0, HISTORY_CHARS) })),
    focus: retrieval.focus ? `«${retrieval.focus.title}»` : null,
    serverNotes: retrieval.notes,
    sources: refs.map(({ ref, evidence }) => ({ id: ref, publisher: evidence.publisher, title: evidence.title, text: evidence.text })),
  };

  const raw = await generate(input);
  const validated = validateModelAnswer(raw, refs, req.question, report);
  return { ...validated, lastEntities: retrieval.entities, focus: retrieval.focus };
}
