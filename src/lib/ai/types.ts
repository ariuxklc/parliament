export type ChatTurn = { role: "user" | "assistant"; content: string };

/** What the user is looking at (e.g. /laws/11151). A hint for the assistant, never a restriction. */
export type ChatEntity = { type: "bill" | "bulletin" | "member" | "vote"; id: string };

export type ChatRequest = {
  question: string;
  history: ChatTurn[];
  context?: ChatEntity;
};

export type ChatCitation = { n: number; title: string; url: string; publisher: string };

export type ChatAnswer = {
  status: "answered";
  /** Answer text (light Markdown: paragraphs, "- " lists, **bold**) with citation markers like [1]. */
  answer: string;
  /** Sources the answer cites, numbered as in the text. */
  citations: ChatCitation[];
  /** Other official records the assistant looked at (not cited in the text). */
  consulted: ChatCitation[];
  /** What the assistant looked up, in order ("legalinfo.mn-ээс хууль хайв: мопед"). */
  steps: string[];
  /** True when a number in the answer could not be found in any record retrieved for it. */
  unverifiedNumbers: boolean;
};

/** Streamed to the browser as NDJSON, one event per line. */
export type ChatEvent = { type: "status"; text: string } | { type: "answer"; answer: ChatAnswer } | { type: "error"; error: string };
