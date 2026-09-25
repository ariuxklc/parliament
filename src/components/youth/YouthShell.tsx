import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import page from "@/components/ask/askPage.module.css";
import { getNavigation } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/format";

export async function YouthShell({ crumbs, children }: { crumbs: { href?: string; label: string }[]; children: ReactNode }) {
  const now = new Date();
  return (
    <>
      <SiteHeader nav={await getNavigation()} />
      <main id="main" className={`container ${page.page}`}>
        <nav className={page.crumbs} aria-label="Байршил">
          <Link href="/">Нүүр хуудас</Link>
          {crumbs.map((c) => (
            <span key={c.label} style={{ display: "contents" }}>
              <span aria-hidden="true">/</span>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
        {children}
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
