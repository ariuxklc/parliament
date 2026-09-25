import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { castOpinion, getOpinions, type Choice } from "@/lib/opinions/store";

/**
 * GET  /api/opinion/:billId → { support, oppose, total, mine }
 * POST /api/opinion/:billId { choice: "support" | "oppose" }
 * Anonymous: a random cookie id (httpOnly) identifies the browser; only its hash is stored.
 */

const COOKIE = "op_voter";
const ONE_YEAR = 60 * 60 * 24 * 365;

// in-memory rate limit per IP (IPs are never written to disk)
const hits = new Map<string, number[]>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function parseId(raw: string): number | null {
  return /^[1-9]\d{0,6}$/.test(raw) ? Number(raw) : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ billId: string }> }) {
  const billId = parseId((await ctx.params).billId);
  if (!billId) return NextResponse.json({ error: "Буруу дугаар" }, { status: 400 });
  const data = await getOpinions(billId, req.cookies.get(COOKIE)?.value ?? null);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ billId: string }> }) {
  const billId = parseId((await ctx.params).billId);
  if (!billId) return NextResponse.json({ error: "Буруу дугаар" }, { status: 400 });

  // same-origin only (stops other sites from casting votes through a visitor's browser)
  const origin = req.headers.get("origin");
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.headers.get("host");
    } catch {}
    if (!sameHost) return NextResponse.json({ error: "Зөвшөөрөгдөөгүй" }, { status: 403 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!allowed(ip)) return NextResponse.json({ error: "Хэт олон хүсэлт. Түр хүлээгээд дахин оролдоно уу." }, { status: 429 });

  let choice: Choice;
  try {
    const body = (await req.json()) as { choice?: unknown };
    if (body.choice !== "support" && body.choice !== "oppose") throw new Error();
    choice = body.choice;
  } catch {
    return NextResponse.json({ error: "Буруу хүсэлт" }, { status: 400 });
  }

  const existing = req.cookies.get(COOKIE)?.value;
  const voterId = existing && /^[0-9a-f-]{36}$/.test(existing) ? existing : randomUUID();
  const data = await castOpinion(billId, voterId, choice);
  const res = NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  if (voterId !== existing) res.cookies.set(COOKIE, voterId, { httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR, path: "/" });
  return res;
}
