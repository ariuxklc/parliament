import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { readJson } from "./store/jsonStore";

/**
 * Short vertical videos for the homepage reel player, listed in data/reels.json (see "_howto" there).
 * Only three kinds are accepted, each resolved to a fixed embed URL, so the file can never inject
 * an arbitrary iframe: a local file under public/videos, a YouTube Short, or an Instagram reel.
 */

export interface Reel {
  id: string;
  kind: "file" | "youtube" | "instagram";
  /** <video> src for files, iframe src for embeds. */
  embedUrl: string;
  /** Original post, for attribution ("@account ↗"). */
  sourceUrl: string | null;
  poster: string | null;
  title: string;
  source: string | null;
  billId: number | null;
  /** How long an embed stays before the player moves on (embeds cannot report when they end). */
  seconds: number;
}

interface RawReel {
  kind?: string;
  src?: string;
  poster?: string;
  title?: string;
  source?: string;
  billId?: number;
  seconds?: number;
}

const PUBLIC_DIR = path.join(process.cwd(), "public");

function resolve(r: RawReel, i: number): Reel | null {
  const title = r.title?.trim();
  if (!r.src || !title) return null;
  const common = {
    title,
    source: r.source?.trim() || null,
    billId: Number.isInteger(r.billId) ? (r.billId as number) : null,
    seconds: Math.min(60, Math.max(5, Number(r.seconds) || 10)),
  };

  if (r.kind === "file") {
    // Local files only: /videos/<name>.mp4|webm, and the file must exist.
    if (!/^\/videos\/[\w.-]+\.(mp4|webm)$/.test(r.src)) return null;
    if (!existsSync(path.join(PUBLIC_DIR, r.src))) return null;
    const poster = r.poster && /^\/videos\/[\w.-]+\.(jpg|jpeg|png|webp)$/.test(r.poster) && existsSync(path.join(PUBLIC_DIR, r.poster)) ? r.poster : null;
    return { id: `file-${i}`, kind: "file", embedUrl: r.src, sourceUrl: null, poster, ...common };
  }

  let url: URL;
  try {
    url = new URL(r.src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  if (r.kind === "instagram" && /(^|\.)instagram\.com$/.test(url.hostname)) {
    const code = url.pathname.match(/^\/(?:reel|reels|p)\/([\w-]{5,20})\/?$/)?.[1];
    if (!code) return null;
    return { id: `ig-${code}`, kind: "instagram", embedUrl: `https://www.instagram.com/reel/${code}/embed/`, sourceUrl: `https://www.instagram.com/reel/${code}/`, poster: null, ...common };
  }

  if (r.kind === "youtube" && /(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname)) {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1] ?? url.searchParams.get("v");
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    const embed = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&rel=0&modestbranding=1`;
    return { id: `yt-${id}`, kind: "youtube", embedUrl: embed, sourceUrl: `https://www.youtube.com/shorts/${id}`, poster: null, ...common };
  }

  return null;
}

export async function getReels(): Promise<Reel[]> {
  const data = await readJson<{ reels?: RawReel[] }>("reels.json", {}).catch(() => ({ reels: [] as RawReel[] }));
  return (data.reels ?? []).map(resolve).filter((r): r is Reel => r !== null).slice(0, 8);
}
