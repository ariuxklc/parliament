import type { NextRequest } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import { callOpenAI, ChatServiceError } from "@/lib/ai/parliament-chat";
import { admitChatRequest, allowModelCall } from "@/lib/ai/rate-limit";
import { MAX_BODY_BYTES, MAX_QUESTION_CHARS, parseChatRequest } from "@/lib/ai/validate-request";
import type { ChatAnswer, ChatEvent } from "@/lib/ai/types";
import { parliamentData, warmUp } from "@/lib/parliament/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 90_000;
const SECRET_ENV = ["OPENAI_API_KEY", "PARLIAMENT_API_USERNAME", "PARLIAMENT_API_PASSWORD", "REVIEW_TOKEN"];

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Defence in depth: the model never sees these values, but nothing that equals one may leave the server. */
function redactSecrets(answer: ChatAnswer): ChatAnswer {
  const secrets = SECRET_ENV.map((k) => process.env[k]?.trim()).filter((v): v is string => !!v && v.length >= 6);
  if (!secrets.some((s) => answer.answer.includes(s))) return answer;
  console.warn("[ask-parliament] redacted a secret from an answer");
  return { ...answer, answer: secrets.reduce((text, s) => text.split(s).join("[нууцалсан]"), answer.answer) };
}

/** GET /api/chat — sent when the chat opens, so the most-asked laws start loading before the first question. */
export function GET() {
  warmUp();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/chat — Ask Parliament AI.
 * Body: { question, history?, context? } (lib/ai/validate-request.ts).
 * Response: NDJSON stream of ChatEvent — {type:"status"} while tools run, then {type:"answer"} or {type:"error"}.
 */
export async function POST(req: NextRequest) {
  warmUp(); // loads the most-asked laws in the background, once per server process
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(415, "JSON хүсэлт шаардлагатай.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail(413, "Хүсэлтийн хэмжээ хэтэрсэн байна.");

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, "Хүсэлтийн хэмжээ хэтэрсэн байна.");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Хүсэлтийн өгөгдөл буруу байна.");
  }
  const request = parseChatRequest(body);
  if (!request) return fail(400, `Асуултаа ${MAX_QUESTION_CHARS} тэмдэгтээс богино бичнэ үү.`);

  // Trust only headers a deployment proxy sets; locally everything is "local".
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const client = /^[a-z0-9-]{8,64}$/i.test(req.headers.get("x-ask-session") ?? "") ? req.headers.get("x-ask-session")! : "anon";
  const admission = admitChatRequest(ip, client);
  if (!admission.ok) return fail(admission.status, admission.message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* client went away */
        }
      };
      const started = Date.now();
      let rounds = 0;
      try {
        const answer = await Promise.race([
          runAgent(request, {
            data: parliamentData,
            onStatus: (text) => send({ type: "status", text }),
            callModel: async (modelReq) => {
              if (!allowModelCall()) throw new ChatServiceError(503, "Өнөөдрийн AI хариултын хязгаарт хүрлээ. Маргааш дахин оролдоно уу.");
              rounds++;
              return callOpenAI(modelReq, `${ip}|${client}`);
            },
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new ChatServiceError(504, "Хариулт хэт удаж байна. Асуултаа арай тодорхой болгоод дахин оролдоно уу.")), REQUEST_TIMEOUT_MS)),
        ]);
        // Operational log: no question text, no secrets.
        console.info(`[ask-parliament] rounds=${rounds} tools=${answer.steps.length} citations=${answer.citations.length} unverified=${answer.unverifiedNumbers} ms=${Date.now() - started}`);
        send({ type: "answer", answer: redactSecrets(answer) });
      } catch (error) {
        const message = error instanceof ChatServiceError ? error.message : "AI туслахаас хариулт авах боломжгүй байна. Дахин оролдоно уу.";
        if (!(error instanceof ChatServiceError)) console.warn("[ask-parliament] failed:", error instanceof Error ? error.message : error);
        send({ type: "error", error: message });
      } finally {
        admission.release();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
