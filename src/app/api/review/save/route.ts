import { NextResponse, type NextRequest } from "next/server";
import { reviewAllowed } from "@/lib/summaries/reviewAccess";
import { getExplainer, saveExplainer } from "@/lib/summaries/store";
import type { BillVideo, ImpactPoint, SummaryPoint } from "@/lib/summaries/types";
import { cleanText } from "@/lib/format";

/**
 * POST /api/review/save
 * { billId, summary, impact, video, action: "save" | "approve" | "unpublish", reviewer }
 * Reviewers may edit wording; citations (refs) are kept from the draft and cannot be invented here.
 */

interface Body {
  billId?: unknown;
  summary?: { text?: unknown; refs?: unknown }[];
  impact?: { who?: unknown; text?: unknown; refs?: unknown }[];
  video?: { src?: unknown; title?: unknown } | null;
  action?: unknown;
  reviewer?: unknown;
}

function normalizeVideo(v: Body["video"]): BillVideo | null {
  if (!v || typeof v.src !== "string" || !v.src.trim()) return null;
  const src = v.src.trim();
  const title = typeof v.title === "string" && v.title.trim() ? v.title.trim().slice(0, 120) : null;
  if (/^\/api\/videos\/[\w.-]+$/.test(src)) return { src, kind: "file", title };
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const yt = /(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname);
  return { src: url.toString(), kind: yt ? "youtube" : "link", title };
}

export async function POST(req: NextRequest) {
  if (!reviewAllowed(req)) return NextResponse.json({ error: "Зөвшөөрөгдөөгүй" }, { status: 403 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Буруу хүсэлт" }, { status: 400 });
  }
  const billId = Number(body.billId);
  const current = Number.isInteger(billId) ? await getExplainer(billId) : null;
  if (!current) return NextResponse.json({ error: "Эхлээд ноорог үүсгэнэ үү." }, { status: 404 });

  const knownRefs = new Set(current.sources.map((s) => s.ref));
  const keepRefs = (r: unknown) => (Array.isArray(r) ? r.filter((x): x is string => typeof x === "string" && knownRefs.has(x)) : []);
  // fields left out of the request keep their current value (never wipe text by omission)
  const summary: SummaryPoint[] = Array.isArray(body.summary)
    ? body.summary
        .map((p) => ({ text: cleanText(String(p.text ?? "")).slice(0, 400), refs: keepRefs(p.refs) }))
        .filter((p) => p.text)
        .slice(0, 5)
    : current.summary;
  const impact: ImpactPoint[] = Array.isArray(body.impact)
    ? body.impact
        .map((p) => ({ who: cleanText(String(p.who ?? "")).slice(0, 40), text: cleanText(String(p.text ?? "")).slice(0, 400), refs: keepRefs(p.refs) }))
        .filter((p) => p.text && p.who)
        .slice(0, 3)
    : current.impact;
  const action = body.action === "approve" || body.action === "unpublish" ? body.action : "save";
  const reviewer = cleanText(String(body.reviewer ?? "")).slice(0, 60);
  if (action === "approve" && !reviewer) return NextResponse.json({ error: "Батлахын өмнө хянасан хүний нэрийг оруулна уу." }, { status: 400 });
  if (action === "approve" && !summary.length) return NextResponse.json({ error: "Хоосон тайлбарыг батлах боломжгүй." }, { status: 400 });

  const edited =
    JSON.stringify(summary.map((p) => p.text)) !== JSON.stringify(current.summary.map((p) => p.text)) ||
    JSON.stringify(impact.map((p) => [p.who, p.text])) !== JSON.stringify(current.impact.map((p) => [p.who, p.text]));

  const saved = await saveExplainer(billId, (cur) => ({
    ...(cur ?? current),
    summary,
    impact,
    video: body.video === undefined ? current.video : normalizeVideo(body.video),
    editedByReviewer: current.editedByReviewer || edited,
    status: action === "approve" ? "approved" : action === "unpublish" ? "draft" : (cur ?? current).status,
    reviewedBy: action === "approve" ? reviewer : (cur ?? current).reviewedBy,
    approvedAt: action === "approve" ? new Date().toISOString() : action === "unpublish" ? null : (cur ?? current).approvedAt,
  }));
  return NextResponse.json(saved);
}
