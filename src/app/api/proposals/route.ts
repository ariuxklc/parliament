import { NextResponse, type NextRequest } from "next/server";
import { getProposals } from "@/lib/data";
import { parseProposalQuery } from "@/lib/normalize/proposals";
import { todayLocal } from "@/lib/format";

/**
 * GET /api/proposals?year=2026&session=2026-fall&stage=drafting&type=1&sort=newest&q=&limit=12
 * Backend for the legislation time browser. Reads official data only (LawForum + Parliament API)
 * and never forwards credentials to the browser.
 */
export async function GET(req: NextRequest) {
  const query = parseProposalQuery(req.nextUrl.searchParams, { year: Number(todayLocal().slice(0, 4)) });
  try {
    const data = await getProposals(query);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (err) {
    console.warn("[api/proposals] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Хуулийн төслийн мэдээллийг эх сурвалжаас авч чадсангүй." }, { status: 502 });
  }
}
