import { NextResponse, type NextRequest } from "next/server";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { dataPath } from "@/lib/store/jsonStore";

/** GET /api/videos/:file — streams an uploaded explainer video with HTTP Range support (needed for seeking). */

const MIME: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^(\d+-\d+)\.(mp4|webm|mov)$/.exec(file);
  if (!m) return NextResponse.json({ error: "Олдсонгүй" }, { status: 404 });
  const full = dataPath(path.join("videos", file));
  let size: number;
  try {
    size = (await fs.stat(full)).size;
  } catch {
    return NextResponse.json({ error: "Олдсонгүй" }, { status: 404 });
  }
  const type = MIME[m[2]];
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { "Content-Type": type, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600" },
    });
  }
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new NextResponse(stream, { headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600" } });
}
