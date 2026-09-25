import { createHash } from "node:crypto";
import { INSTRUCTIONS, OUTPUT_SCHEMA } from "./prompt.ts";

/**
 * Isolated OpenAI Responses API call for project briefs (server-side only; not shared with the chatbot).
 * The key is read here and never logged, returned or sent anywhere but api.openai.com. Errors carry
 * status codes only — never response bodies or headers.
 */

export class BriefModelError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BriefModelError";
    this.status = status;
  }
}

export function briefModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";
}

export interface ModelResult {
  output: unknown;
  refused: boolean;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export async function callBriefModel(input: unknown, opts: { timeoutMs?: number } = {}): Promise<ModelResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new BriefModelError(503, "OPENAI_API_KEY is not configured");
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: briefModelName(),
        store: false,
        reasoning: { effort: "medium" },
        max_output_tokens: 8_000,
        instructions: INSTRUCTIONS,
        safety_identifier: createHash("sha256").update("project-brief").digest("hex").slice(0, 32),
        input: [{ role: "user", content: JSON.stringify(input) }],
        text: { format: { type: "json_schema", name: "project_brief", strict: true, schema: OUTPUT_SCHEMA } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    });
  } catch (err) {
    throw new BriefModelError(504, err instanceof Error && err.name === "TimeoutError" ? "model timeout" : "model network error");
  }
  if (!res.ok) throw new BriefModelError(res.status, `model HTTP ${res.status}`);
  const body = (await res.json()) as {
    status?: string;
    output?: { type?: string; content?: { type?: string; text?: string }[] }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const usage = { inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null };
  if (body.status !== "completed") throw new BriefModelError(502, `model response ${body.status ?? "incomplete"}`);
  const parts = body.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []) ?? [];
  if (parts.some((p) => p.type === "refusal")) return { output: null, refused: true, usage };
  const text = parts
    .filter((p) => p.type === "output_text")
    .map((p) => p.text ?? "")
    .join("");
  try {
    return { output: JSON.parse(text), refused: false, usage };
  } catch {
    throw new BriefModelError(502, "model returned invalid JSON");
  }
}
