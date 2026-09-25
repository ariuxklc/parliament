import type { ChatEntity, ChatRequest, ChatTurn } from "./types.ts";

export const MAX_QUESTION_CHARS = 1_000;
export const MAX_HISTORY_TURNS = 8;
export const MAX_TURN_CHARS = 4_000;
export const MAX_BODY_BYTES = 40_000;

const ENTITY_TYPES = new Set(["bill", "bulletin", "member", "vote"]);

function entity(value: unknown): ChatEntity | undefined {
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  if (!ENTITY_TYPES.has(String(row.type)) || typeof row.id !== "string" || !/^[1-9]\d{0,9}$/.test(row.id)) return;
  return { type: row.type as ChatEntity["type"], id: row.id };
}

/** Strip control and bidi-override characters; collapse runs of spaces. */
function clean(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/[ \t]+/g, " ").trim();
}

/** Returns null for anything malformed. The page context is an id hint only — never fetched as a URL. */
export function parseChatRequest(value: unknown): ChatRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.question !== "string") return null;
  const question = clean(input.question);
  if (!question || question.length > MAX_QUESTION_CHARS) return null;

  const history = input.history ?? [];
  if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) return null;
  const turns: ChatTurn[] = [];
  for (const turn of history) {
    if (!turn || typeof turn !== "object") return null;
    const { role, content } = turn as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.length > MAX_TURN_CHARS) return null;
    turns.push({ role, content: clean(content) });
  }

  let context = input.context == null ? undefined : entity(input.context);
  if (input.context != null && !context) return null;
  if (input.billId != null) {
    // Original bill-page contract: { billId: 11151 }.
    if (!Number.isSafeInteger(input.billId) || Number(input.billId) < 1 || Number(input.billId) > 9_999_999_999) return null;
    context ??= { type: "bill", id: String(input.billId) };
  }
  return { question, history: turns, context };
}
