import "server-only";
import { createHash } from "node:crypto";
import { PARLIAMENT_CHAT_INSTRUCTIONS } from "./system-prompt.ts";
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
  usage?: { input_tokens?: number; output_tokens?: number };
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
const MAX_OUTPUT_TOKENS = 1_600; // includes reasoning tokens

/**
 * One bounded, tool-free Responses API call. The model receives only the question, a short
 * conversation excerpt, server notes and the retrieved official passages — never keys, credentials,
 * files or URLs it could fetch. `store: false` keeps questions out of OpenAI's stored responses.
 */
export async function generateParliamentAnswer(input: ModelInput, clientKey: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ChatServiceError(503, "AI үйлчилгээ одоогоор тохируулагдаагүй байна (OPENAI_API_KEY).");

  const payload = {
    model: process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    instructions: PARLIAMENT_CHAT_INSTRUCTIONS,
    // A one-way hash lets OpenAI's abuse monitoring group requests without learning who sent them.
    safety_identifier: createHash("sha256").update(`ask-parliament:${clientKey}`).digest("hex").slice(0, 32),
    input: [{ role: "user", content: JSON.stringify(input) }],
    text: { format: { type: "json_schema", name: "parliament_answer", strict: true, schema: OUTPUT_SCHEMA } },
  };

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new ChatServiceError(timeout ? 504 : 503, timeout ? "AI хариулт хэт удаж байна. Дахин оролдоно уу." : "AI үйлчилгээтэй холбогдож чадсангүй. Дахин оролдоно уу.");
  }
  if (!response.ok) {
    // Log status only — never request bodies or headers.
    console.warn(`[ask-parliament] OpenAI HTTP ${response.status}`);
    throw new ChatServiceError(response.status === 429 ? 429 : 503, "AI үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.");
  }

  let body: ResponsePayload;
  try {
    body = (await response.json()) as ResponsePayload;
  } catch {
    throw new ChatServiceError(502, "AI үйлчилгээний хариултыг уншиж чадсангүй.");
  }
  if (body.status !== "completed") {
    console.warn(`[ask-parliament] OpenAI status ${body.status} ${body.incomplete_details?.reason ?? ""}`);
    throw new ChatServiceError(502, "AI хариулт дуусаагүй байна. Дахин оролдоно уу.");
  }
  const parts = body.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []) ?? [];
  if (parts.some((p) => p.type === "refusal")) return { insufficientEvidence: true, points: [], limitations: "" };
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
  if (!text) throw new ChatServiceError(502, "AI хариулт хоосон байна. Дахин оролдоно уу.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ChatServiceError(502, "AI хариултыг баталгаажуулж чадсангүй.");
  }
}
