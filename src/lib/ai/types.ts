export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Retrieval hints the browser may send back. IDs are hints, never URLs:
 *  bill = LawForum project id, bulletin = new.parliament.mn bill-bulletin row id,
 *  member = new.parliament.mn member id, vote = new.parliament.mn public poll id.
 */
export type ChatEntity = { type: "bill" | "bulletin" | "member" | "vote"; id: string };

export type ChatRequest = {
  question: string;
  history: ChatTurn[];
  /** The page the user is on (e.g. /laws/11151). Boosts retrieval; never restricts it. */
  context?: ChatEntity;
  /** Entities the previous answer was about, for follow-ups like "Одоо ямар шатандаа байгаа?". */
  lastEntities: ChatEntity[];
  /** An option the user picked from a clarification question. */
  selected?: ChatEntity;
};

export type SourceKind = "bill" | "bill_text" | "bill_outline" | "bill_files" | "bulletin" | "vote" | "member" | "committee" | "schedule" | "session" | "list";

/** Server-owned evidence. The model sees only a request-local ref, the title and the text. */
export type Evidence = {
  sourceId: string;
  kind: SourceKind;
  publisher: "LawForum" | "new.parliament.mn";
  title: string;
  url: string;
  text: string;
  entity?: ChatEntity;
};

export type ChatCitation = { n: number; sourceId: string; title: string; url: string; publisher: string; kind: SourceKind };

export type ChatChoice = { entity: ChatEntity; title: string; detail: string };

export type AnswerStatus = "answered" | "insufficient" | "clarify";

/** Server-owned pointers to where the law in force can be checked. Not citations: nothing in the answer rests on them. */
export type LegalHelp = { text: string; links: { title: string; url: string }[] };

export type ChatAnswer = {
  status: AnswerStatus;
  /** ai = model explanation of retrieved evidence; data = server template over official data (no model); none = no answer. */
  mode: "ai" | "data" | "none";
  /** Plain-text answer (also used as conversation history). */
  answer: string;
  /** Answer split into statements, each linked to citation numbers. */
  points: { text: string; citations: number[] }[];
  /** What the evidence does not cover (no citation needed). */
  limitations?: string;
  insufficientEvidence: boolean;
  citations: ChatCitation[];
  /** Official pages that looked relevant but did not support an answer. Not citations. */
  related?: ChatCitation[];
  choices?: ChatChoice[];
  lastEntities: ChatEntity[];
  focus?: { entity: ChatEntity; title: string };
  /** For legal-situation questions: where to check the law in force. */
  help?: LegalHelp;
  /** How the question was interpreted, when question understanding corrected or rephrased it. */
  understood?: string;
};

export const INSUFFICIENT_ANSWER = "Одоогоор ашиглаж буй албан ёсны эх сурвалжаас энэ асуултад баталгаатай хариулах хангалттай мэдээлэл олдсонгүй.";
