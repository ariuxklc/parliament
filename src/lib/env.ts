import "server-only";

/**
 * Server-side configuration. Values come from `.env.local` (never committed) or the host's secret store.
 * Nothing in this module may be imported by a client component — `server-only` enforces that at build time.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export const serverEnv = {
  get lawforumApiBaseUrl() {
    return (read("LAWFORUM_API_BASE_URL") ?? "https://lawforum.parliament.mn/LawForumAPI").replace(/\/$/, "");
  },
  get parliamentSiteApiBaseUrl() {
    return `${(read("NEXT_PUBLIC_PARLIAMENT_SITE_URL") ?? "https://new.parliament.mn").replace(/\/$/, "")}/api`;
  },
  /** Returns null when credentials are not configured, so callers can degrade gracefully. */
  get parliamentApi() {
    const baseUrl = read("PARLIAMENT_API_BASE_URL");
    const username = read("PARLIAMENT_API_USERNAME");
    const password = read("PARLIAMENT_API_PASSWORD");
    if (!baseUrl || !username || !password) return null;
    return { baseUrl: baseUrl.replace(/\/$/, ""), username, password };
  },
};
