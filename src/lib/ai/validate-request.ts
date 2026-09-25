import type { ChatEntity, ChatRequest, ChatTurn } from "./types.ts";

export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_TURNS = 6;
export const MAX_TURN_CHARS = 1_200;
export const MAX_BODY_BYTES = 12_000;

const ENTITY_TYPES = new Set(["bill", "bulletin", "member", "vote"]);

function entity(value: unknown): ChatEntity | undefined {
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  if (!ENTITY_TYPES.has(String(row.type)) || typeof row.id !== "string" || !/^[1-9]\d{0,9}$/.test(row.id)) return;
  return { type: row.type as ChatEntity["type"], id: row.id };
}

/** Strip control characters (except newline/tab) and collapse runs of whitespace. */
function clean(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/[ \t]+/g, " ").trim();
}

/** Returns null for anything malformed. Entity IDs are retrieval hints only — never fetched as URLs. */
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
  // Original bill-page contract: { billId: 11151 }.
  if (input.billId != null) {
    if (!Number.isSafeInteger(input.billId) || Number(input.billId) < 1 || Number(input.billId) > 9_999_999_999) return null;
    context ??= { type: "bill", id: String(input.billId) };
  }

  const selected = input.selected == null ? undefined : entity(input.selected);
  if (input.selected != null && !selected) return null;

  const last = input.lastEntities ?? [];
  if (!Array.isArray(last) || last.length > 3) return null;
  const lastEntities = last.map(entity);
  if (lastEntities.some((item) => !item)) return null;

  return { question, history: turns, context, lastEntities: lastEntities as ChatEntity[], selected };
}
