import styles from "./explainer.module.css";
import type { BillVideo } from "@/lib/summaries/types";
import { ArrowUpRight, Play } from "../ui/icons";

/** youtube.com/watch?v=ID · youtu.be/ID · youtube.com/shorts/ID → privacy-enhanced embed URL. */
function youtubeEmbed(src: string): { url: string; vertical: boolean } | null {
  try {
    const u = new URL(src);
    let id: string | null = null;
    let vertical = false;
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (u.pathname.startsWith("/shorts/")) {
      id = u.pathname.split("/")[2] ?? null;
      vertical = true;
    } else id = u.searchParams.get("v");
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { url: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, vertical };
  } catch {
    return null;
  }
}

/** The team's short explainer video: uploaded file, YouTube (incl. Shorts) or any other link. */
export function VideoBlock({ video }: { video: BillVideo }) {
  const label = video.title ?? "Тайлбар видео";
  if (video.kind === "file") {
    return (
      <video className={styles.video} src={video.src} controls playsInline preload="metadata" aria-label={label}>
        <a href={video.src}>{label}</a>
      </video>
    );
  }
  if (video.kind === "youtube") {
    const embed = youtubeEmbed(video.src);
    if (embed) {
      return (
        <div className={styles.frame} data-vertical={embed.vertical}>
          <iframe
            src={embed.url}
            title={label}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    }
  }
  return (
    <a className={styles.videoLink} href={video.src} target="_blank" rel="noopener noreferrer">
      <Play size={18} />
      {label}
      <ArrowUpRight size={14} />
      <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
    </a>
  );
}
