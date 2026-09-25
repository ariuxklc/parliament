/**
 * Official image hosts we render through next/image. Shared by next.config.ts and the normalizers,
 * so an image from an unexpected host degrades to a placeholder instead of crashing the page.
 */
export const IMAGE_HOSTS = ["new.parliament.mn", "www.parliament.mn", "img.parliament.mn", "lawforum.parliament.mn"] as const;

export function safeImage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (IMAGE_HOSTS as readonly string[]).includes(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}
