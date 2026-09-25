import { NextResponse, type NextRequest } from "next/server";
import { ExplainerError, getOrCreateExplainer } from "@/lib/summaries/generate";

/**
 * GET /api/bills/:billId/summary — the bill's AI explainer. Returns the cached one instantly, or writes
 * it now (first visit, ~6–10 s). Generation is rate-limited per visitor and per day.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ billId: string }> }) {
  const raw = (await ctx.params).billId;
  if (!/^[1-9]\d{0,6}$/.test(raw)) return NextResponse.json({ error: "Буруу дугаар" }, { status: 400 });
  const clientKey = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  try {
    const explainer = await getOrCreateExplainer(Number(raw), clientKey);
    return NextResponse.json(explainer, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ExplainerError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.warn(`[api/bills/${raw}/summary] failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "AI тайлбар бэлтгэж чадсангүй." }, { status: 500 });
  }
}
