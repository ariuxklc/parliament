import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { reviewAllowed } from "@/lib/summaries/reviewAccess";
import { getExplainer, saveExplainer } from "@/lib/summaries/store";
import { dataPath } from "@/lib/store/jsonStore";

/** POST /api/review/video (multipart: billId, file, title?) — stores an uploaded explainer video for a bill. */

const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const MAX_BYTES = 250 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!reviewAllowed(req)) return NextResponse.json({ error: "Зөвшөөрөгдөөгүй" }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Файл уншиж чадсангүй" }, { status: 400 });
  }
  const billId = Number(form.get("billId"));
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || null;
  if (!Number.isInteger(billId) || billId <= 0) return NextResponse.json({ error: "Төслийн дугаар буруу" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Видео файл сонгоно уу" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Зөвхөн MP4, WebM эсвэл MOV видео" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Видео 250 MB-аас бага байх ёстой" }, { status: 413 });
  if (!(await getExplainer(billId))) return NextResponse.json({ error: "Эхлээд энэ төслийн ноорог үүсгэнэ үү." }, { status: 404 });

  const name = `${billId}-${Date.now()}.${ext}`;
  const full = dataPath(path.join("videos", name));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, Buffer.from(await file.arrayBuffer()));

  const saved = await saveExplainer(billId, (cur) => ({ ...cur!, video: { src: `/api/videos/${name}`, kind: "file", title } }));
  return NextResponse.json(saved);
}
