import "server-only";
import type { NextRequest } from "next/server";

/**
 * Who may generate / edit / approve explainers and upload videos.
 * - `npm run dev` on the team laptop: allowed (local demo workflow).
 * - Any other environment: only with header `x-review-token` equal to REVIEW_TOKEN (server env).
 * Requests from other sites are always rejected.
 */
export function reviewAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return false;
    } catch {
      return false;
    }
  }
  if (process.env.NODE_ENV === "development") return true;
  const token = process.env.REVIEW_TOKEN?.trim();
  return Boolean(token) && req.headers.get("x-review-token") === token;
}

export function reviewEnabledOnServer(): boolean {
  return process.env.NODE_ENV === "development" || Boolean(process.env.REVIEW_TOKEN?.trim());
}
