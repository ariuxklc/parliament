import "server-only";
import { createHash } from "node:crypto";
import { PARLIAMENT_CHAT_INSTRUCTIONS } from "./system-prompt.ts";
import { UNDERSTAND_INSTRUCTIONS, UNDERSTAND_SCHEMA } from "./understand.ts";
import type { ModelInput } from "./answer-question.ts";

export class ChatServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

type ResponsePayload = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insufficientEvidence", "points", "limitations"],
  properties: {
    insufficientEvidence: { type: "boolean" },
    points: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "sourceIds"],
        properties: {
          text: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    limitations: { type: "string" },
  },
} as const;

export const MODEL_TIMEOUT_MS = 25_000;

type CallOptions = {
  name: string;
  instructions: string;
  input: unknown;
  schema: object;
  maxOutputTokens: number;
  timeoutMs: number;
  clientKey: string;
};

/**
 * One bounded, tool-free Responses API call with a strict JSON schema. The model never receives keys,
 * credentials, files, URLs to fetch or tools. `store: false` keeps questions out of stored responses.
 */
async function callModel(opts: CallOptions): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ChatServiceError(503, "AI үйлчилгээ одоогоор тохируулагдаагүй байна (OPENAI_API_KEY).");

  const payload = {
    model: process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: opts.maxOutputTokens,
    instructions: opts.instructions,
    // A one-way hash lets OpenAI's abuse monitoring group requests without learning who sent them.
    safety_identifier: createHash("sha256").update(`ask-parliament:${opts.clientKey}`).digest("hex").slice(0, 32),
    input: [{ role: "user", content: JSON.stringify(opts.input) }],
    text: { format: { type: "json_schema", name: opts.name, strict: true, schema: opts.schema } },
  };

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new ChatServiceError(timeout ? 504 : 503, timeout ? "AI хариулт хэт удаж байна. Дахин оролдоно уу." : "AI үйлчилгээтэй холбогдож чадсангүй. Дахин оролдоно уу.");
  }
  if (!response.ok) {
    // Log status only — never request bodies or headers.
    console.warn(`[ask-parliament] OpenAI ${opts.name} HTTP ${response.status}`);
    throw new ChatServiceError(response.status === 429 ? 429 : 503, "AI үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.");
  }

  let body: ResponsePayload;
  try {
    body = (await response.json()) as ResponsePayload;
  } catch {
    throw new ChatServiceError(502, "AI үйлчилгээний хариултыг уншиж чадсангүй.");
  }
  if (body.status !== "completed") {
    console.warn(`[ask-parliament] OpenAI ${opts.name} status ${body.status} ${body.incomplete_details?.reason ?? ""}`);
    throw new ChatServiceError(502, "AI хариулт дуусаагүй байна. Дахин оролдоно уу.");
  }
  const parts = body.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []) ?? [];
  if (parts.some((p) => p.type === "refusal")) return null;
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
  if (!text) throw new ChatServiceError(502, "AI хариулт хоосон байна. Дахин оролдоно уу.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ChatServiceError(502, "AI хариултыг баталгаажуулж чадсангүй.");
  }
}

/** Explains retrieved official evidence. */
export async function generateParliamentAnswer(input: ModelInput, clientKey: string): Promise<unknown> {
  const out = await callModel({
    name: "parliament_answer",
    instructions: PARLIAMENT_CHAT_INSTRUCTIONS,
    input,
    schema: OUTPUT_SCHEMA,
    maxOutputTokens: 1_600, // includes reasoning tokens
    timeoutMs: MODEL_TIMEOUT_MS,
    clientKey,
  });
  return out ?? { insufficientEvidence: true, points: [], limitations: "" };
}

/** Turns a messy question into a search plan. Sees only the question text; its output only steers search. */
export async function understandQuestion(input: { question: string; previousQuestion: string | null }, clientKey: string): Promise<unknown> {
  return callModel({
    name: "question_plan",
    instructions: UNDERSTAND_INSTRUCTIONS,
    input,
    schema: UNDERSTAND_SCHEMA,
    maxOutputTokens: 700,
    timeoutMs: 12_000,
    clientKey,
  });
}
