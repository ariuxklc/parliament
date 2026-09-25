import { NextResponse, type NextRequest } from "next/server";
import { answerQuestion } from "@/lib/ai/answer-question";
import { generateParliamentAnswer, understandQuestion, ChatServiceError } from "@/lib/ai/parliament-chat";
import { admitChatRequest, allowModelCall, cachedAnswer, storeAnswer } from "@/lib/ai/rate-limit";
import { MAX_BODY_BYTES, MAX_QUESTION_CHARS, parseChatRequest } from "@/lib/ai/validate-request";
import type { ValidationReport } from "@/lib/ai/validate-answer";
import { parliamentData } from "@/lib/parliament/data";
import { SourceError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const REQUEST_TIMEOUT_MS = 45_000;

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * POST /api/chat — Ask Parliament AI.
 * Body: { question, history?, context?, lastEntities?, selected? } (see lib/ai/validate-request.ts).
 * The OpenAI key and Parliament credentials stay on this server; the response contains only the
 * validated answer and official links from the server's own records.
 */
export async function POST(req: NextRequest) {
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

  const started = Date.now();
  const cacheKey = JSON.stringify([request.question.toLocaleLowerCase("mn"), request.context, request.lastEntities, request.selected]);
  // The cache outlives hot reloads, so it is off in development to keep code changes visible.
  const useCache = process.env.NODE_ENV === "production";
  try {
    const cached = useCache ? cachedAnswer(cacheKey) : undefined;
    if (cached) return NextResponse.json(cached, { headers: NO_STORE });

    const report: ValidationReport = { dropped: [] };
    let modelUsed = false;
    let understood = false;
    const answer = await Promise.race([
      answerQuestion(
        request,
        parliamentData,
        async (input) => {
          if (!allowModelCall()) throw new ChatServiceError(503, "Өнөөдрийн AI тайлбарын хязгаарт хүрлээ. Маргааш дахин оролдоно уу.");
          modelUsed = true;
          return generateParliamentAnswer(input, `${ip}|${client}`);
        },
        report,
        async (input) => {
          if (!allowModelCall()) return null; // skip understanding rather than fail the request
          understood = true;
          return understandQuestion(input, `${ip}|${client}`);
        },
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new ChatServiceError(504, "Хариулт хэт удаж байна. Дахин оролдоно уу.")), REQUEST_TIMEOUT_MS)),
    ]);

    // Operational log: no question text, no secrets.
    console.info(
      `[ask-parliament] status=${answer.status} mode=${answer.mode} understand=${understood} model=${modelUsed} help=${!!answer.help} citations=${answer.citations.length} ` +
        `dropped=${report.dropped.map((d) => d.reason).join(",") || "0"} ms=${Date.now() - started}`,
    );
    if (useCache && answer.status !== "clarify") storeAnswer(cacheKey, answer);
    return NextResponse.json(answer, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ChatServiceError) return fail(error.status, error.message);
    if (error instanceof SourceError) {
      console.warn(`[ask-parliament] source unavailable: ${error.message}`);
      return fail(503, "Албан ёсны эх сурвалж түр боломжгүй байна. Дахин оролдоно уу.");
    }
    console.warn("[ask-parliament] failed:", error instanceof Error ? error.message : error);
    return fail(502, "AI тайлбарыг одоогоор авах боломжгүй байна. Дахин оролдоно уу.");
  } finally {
    admission.release();
  }
}
