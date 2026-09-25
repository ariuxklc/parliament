import { NextResponse, type NextRequest } from "next/server";
import { getMemberProfile } from "@/lib/data";
import { SourceError } from "@/lib/http";

/** GET /api/members/:id — expanded profile for the member showcase card (official data only). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0 || id > 100_000) {
    return NextResponse.json({ error: "Буруу дугаар" }, { status: 400 });
  }
  try {
    const profile = await getMemberProfile(id);
    return NextResponse.json(profile, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" },
    });
  } catch (err) {
    if (err instanceof SourceError && err.status === 404) {
      return NextResponse.json({ error: "Гишүүн олдсонгүй" }, { status: 404 });
    }
    console.warn(`[api/members/${id}] failed:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Гишүүний мэдээллийг эх сурвалжаас авч чадсангүй." }, { status: 502 });
  }
}
