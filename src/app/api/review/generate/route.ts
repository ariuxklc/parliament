import { NextResponse, type NextRequest } from "next/server";
import { reviewAllowed } from "@/lib/summaries/reviewAccess";
import { ExplainerError, generateExplainer } from "@/lib/summaries/generate";

/** POST /api/review/generate { billId } — drafts an explainer with the AI model. Saved as a draft, never published. */
export async function POST(req: NextRequest) {
  if (!reviewAllowed(req)) return NextResponse.json({ error: "Зөвшөөрөгдөөгүй" }, { status: 403 });
  let billId: number;
  try {
    billId = Number(((await req.json()) as { billId?: unknown }).billId);
    if (!Number.isInteger(billId) || billId <= 0) throw new Error();
  } catch {
    return NextResponse.json({ error: "Төслийн дугаар буруу" }, { status: 400 });
  }
  try {
    return NextResponse.json(await generateExplainer(billId));
  } catch (err) {
    if (err instanceof ExplainerError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.warn("[review/generate] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Ноорог үүсгэж чадсангүй." }, { status: 500 });
  }
}
