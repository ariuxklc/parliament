import "server-only";
import { createHash } from "node:crypto";
import type { ModelRequest, ModelResponse } from "./agent.ts";

export class ChatServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const ROUND_TIMEOUT_MS = 30_000;

/**
 * One Responses API round with function tools. Stateless (`store: false`): the agent passes the previous
 * output items — including encrypted reasoning — back in `input`. The key stays on this server; the model
 * only ever receives the conversation, the guidelines and tool results.
 */
export async function callOpenAI(req: ModelRequest, clientKey: string): Promise<ModelResponse> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ChatServiceError(503, "AI үйлчилгээ одоогоор тохируулагдаагүй байна (OPENAI_API_KEY).");

  const payload = {
    model: process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
    store: false,
    include: ["reasoning.encrypted_content"],
    // Agentic search benefits from some planning; "low" answered from too few lookups in testing.
    reasoning: { effort: process.env.OPENAI_REASONING_EFFORT?.trim() || "medium" },
    max_output_tokens: 6_000,
    instructions: req.instructions,
    input: req.input,
    tools: req.tools,
    tool_choice: req.toolChoice,
    parallel_tool_calls: true,
    // A one-way hash lets OpenAI's abuse monitoring group requests without learning who sent them.
    safety_identifier: createHash("sha256").update(`ask-parliament:${clientKey}`).digest("hex").slice(0, 32),
  };

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(ROUND_TIMEOUT_MS),
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
  const body = (await response.json().catch(() => null)) as { status?: string; incomplete_details?: { reason?: string }; output?: unknown[] } | null;
  if (!body || !Array.isArray(body.output)) throw new ChatServiceError(502, "AI үйлчилгээний хариултыг уншиж чадсангүй.");
  if (body.status !== "completed" && body.status !== "incomplete") {
    console.warn(`[ask-parliament] OpenAI status ${body.status}`);
    throw new ChatServiceError(502, "AI хариулт дуусаагүй байна. Дахин оролдоно уу.");
  }
  return { output: body.output as ModelResponse["output"], incomplete: body.status === "incomplete" };
}
