import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { readJson } from "../store/jsonStore";
import type { BillVideo } from "./types";

/**
 * Explainer video for a bill — no admin tool needed:
 *  1. put a file at public/videos/<billId>.mp4 (or .webm), e.g. public/videos/11151.mp4, or
 *  2. add a link to data/videos.json: { "11151": "https://www.youtube.com/shorts/…" }
 */
const PUBLIC_VIDEOS = path.join(process.cwd(), "public", "videos");

export async function findVideo(billId: number): Promise<BillVideo | null> {
  for (const ext of ["mp4", "webm"]) {
    if (existsSync(path.join(PUBLIC_VIDEOS, `${billId}.${ext}`))) return { src: `/videos/${billId}.${ext}`, kind: "file", title: null };
  }
  const links = await readJson<Record<string, string>>("videos.json", {});
  const raw = links[String(billId)];
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const yt = /(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname);
    return { src: url.toString(), kind: yt ? "youtube" : "link", title: null };
  } catch {
    return null;
  }
}
