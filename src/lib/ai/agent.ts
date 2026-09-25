import type { ParliamentData } from "../parliament/records.ts";
import { buildInstructions, contextNote } from "./system-prompt.ts";
import { SourceRegistry, hasUnverifiedNumbers, resolveCitations } from "./sources.ts";
import { runTool, toolLabel, TOOL_SCHEMAS } from "./tools.ts";
import type { ChatAnswer, ChatRequest } from "./types.ts";

/**
 * Ask Parliament AI agent loop.
 *   user question (+ recent conversation, page context)
 *     → model decides which read-only tools to call (laws, bills, meetings, votes, transcripts, members…)
 *     → server runs them against official sources and registers every record as a citable ref
 *     → repeat (≤ 6 rounds, ≤ 10 tool calls) → final answer with [S#] refs → server turns refs into links.
 * Pure: the data source and the model are injected, so tests run offline.
 */

export type FunctionCallItem = { type: "function_call"; call_id: string; name: string; arguments: string };
export type OutputItem = { type: string; [key: string]: unknown };
export type ModelRequest = { instructions: string; input: unknown[]; tools: typeof TOOL_SCHEMAS; toolChoice: "auto" | "none" };
export type ModelResponse = { output: OutputItem[]; incomplete?: boolean };
export type CallModel = (req: ModelRequest) => Promise<ModelResponse>;

export const MAX_ROUNDS = 6;
export const MAX_TOOL_CALLS = 10;
const HISTORY_TURNS = 6;
const HISTORY_CHARS = 1_500;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;

const isFunctionCall = (item: OutputItem): item is OutputItem & FunctionCallItem =>
  item.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string";

function outputText(items: OutputItem[]): string {
  return items
    .filter((i) => i.type === "message")
    .flatMap((i) => (Array.isArray(i.content) ? (i.content as { type?: string; text?: string }[]) : []))
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

export async function runAgent(
  req: ChatRequest,
  deps: { data: ParliamentData; callModel: CallModel; onStatus?: (text: string) => void; today?: string },
): Promise<ChatAnswer> {
  const today = deps.today ?? deps.data.today();
  const sources = new SourceRegistry();
  const ctx = { data: deps.data, sources, today };
  // Numbers the answer may use without a source: the conversation and today's date, plus every record retrieved.
  const corpus: string[] = [req.question, ...req.history.map((t) => t.content), today];
  const steps: string[] = [];
  const note = contextNote(req.context);
  const input: unknown[] = [
    ...req.history.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, content: t.content.slice(0, HISTORY_CHARS) })),
    { role: "user", content: note ? `${note}\n\n${req.question}` : req.question },
  ];
  const instructions = buildInstructions({ today });

  let toolCalls = 0;
  let finalText = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const mustAnswer = round === MAX_ROUNDS - 1 || toolCalls >= MAX_TOOL_CALLS;
    const res = await deps.callModel({ instructions, input, tools: TOOL_SCHEMAS, toolChoice: mustAnswer ? "none" : "auto" });
    const calls = res.output.filter(isFunctionCall);
    if (!calls.length || mustAnswer) {
      finalText = outputText(res.output);
      break;
    }
    input.push(...res.output);
    const results = await Promise.all(
      calls.map(async (call) => {
        if (toolCalls >= MAX_TOOL_CALLS) {
          return { call, output: JSON.stringify({ error: "Хэрэгслийн дуудлагын хязгаарт хүрлээ; одоо байгаа мэдээллээр хариул." }) };
        }
        toolCalls++;
        const label = toolLabel(call.name, call.arguments);
        if (!steps.includes(label)) steps.push(label);
        deps.onStatus?.(label);
        const { output } = await runTool(call.name, call.arguments, ctx);
        return { call, output };
      }),
    );
    for (const r of results) {
      input.push({ type: "function_call_output", call_id: r.call.call_id, output: r.output });
      // A searched date range may be named in the answer ("no sitting on 21–25 Sep") without being a claim.
      corpus.push(r.output, ...(r.call.arguments.match(ISO_DATE) ?? []));
    }
  }

  if (!finalText.trim()) {
    finalText = "Уучлаарай, энэ удаад хариултыг бүрэн гаргаж чадсангүй. Асуултаа арай өөрөөр эсвэл илүү тодорхой асууна уу.";
  }
  const resolved = resolveCitations(finalText, sources);
  return {
    status: "answered",
    answer: resolved.text,
    citations: resolved.citations,
    consulted: resolved.consulted,
    steps,
    unverifiedNumbers: hasUnverifiedNumbers(resolved.text, corpus),
  };
}
