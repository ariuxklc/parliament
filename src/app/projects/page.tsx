import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { EmptyState } from "@/components/ui/EmptyState";
import ui from "@/components/ui/ui.module.css";
import { ProjectBrowser, type BrowserQuery } from "@/components/projects/ProjectBrowser";
import styles from "@/components/projects/projects.module.css";
import { getNavigation } from "@/lib/data";
import { load } from "@/lib/http";
import { formatDate, formatTime } from "@/lib/format";
import { getProjectListItems } from "@/lib/projects/catalog";
import type { InitiatorGroup } from "@/lib/projects/types";

export const metadata: Metadata = {
  title: "Өргөн мэдүүлсэн төслүүд — Open Parliament",
  description: "Улсын Их Хуралд өргөн мэдүүлсэн хууль, тогтоолын төслүүд, тэдгээрийн албан ёсны баримт бичиг, AI товч тайлбар.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const GROUPS: InitiatorGroup[] = ["Засгийн газар", "УИХ-ын гишүүд", "Ерөнхийлөгч", "Бусад"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function parseQuery(sp: Record<string, string | string[] | undefined>): BrowserQuery {
  const year = Number(one(sp.year));
  const group = one(sp.group) as InitiatorGroup;
  return {
    q: one(sp.q).slice(0, 120),
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    type: one(sp.type).slice(0, 80) || null,
    group: GROUPS.includes(group) ? group : null,
    ai: one(sp.ai) === "1",
    sort: one(sp.sort) === "oldest" ? "oldest" : "newest",
  };
}

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const initial = parseQuery(await searchParams);
  const [nav, data] = await Promise.all([getNavigation(), load("submitted projects", getProjectListItems)]);
  const now = new Date();

  return (
    <>
      <SiteHeader nav={nav} />
      <main id="main" className={`container ${styles.page}`}>
        <nav className={styles.crumbs} aria-label="Байршил">
          <Link href="/">Нүүр хуудас</Link>
          <span aria-hidden="true">/</span>
          <span>Өргөн мэдүүлсэн төслүүд</span>
        </nav>
        <p className={styles.eyebrow}>Хууль тогтоомжийн төсөл</p>
        <h1 className={styles.title}>Өргөн мэдүүлсэн төслүүд</h1>
        <p className={styles.lede}>Улсын Их Хуралд өргөн мэдүүлсэн хууль, тогтоолын төслүүд — албан ёсны баримт бичиг, товч AI тайлбартай.</p>
        <p className={styles.sourceLine}>
          Эх сурвалж:{" "}
          <a href="https://d.parliament.mn/" target="_blank" rel="noopener noreferrer">
            d.parliament.mn
          </a>
          {data.ok ? ` · ${formatDate(data.data.meta.fetchedAt)} ${formatTime(data.data.meta.fetchedAt)}` : ""}
        </p>
        {data.ok && data.data.meta.stale ? (
          <p className={styles.staleNote} role="note">
            Албан ёсны эх сурвалжтай одоогоор холбогдож чадсангүй — хамгийн сүүлд хадгалсан жагсаалтыг харуулж байна.
          </p>
        ) : null}

        {data.ok ? (
          <ProjectBrowser items={data.data.items} initial={initial} />
        ) : (
          <div style={{ marginTop: 28 }}>
            <EmptyState
              title="Төслийн жагсаалтыг ачаалж чадсангүй"
              body="Албан ёсны эх сурвалж түр хариу өгөхгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу, эсвэл Цахим парламентаас шууд үзнэ үү."
              actions={
                <>
                  <a className={`${ui.button} ${ui.buttonBlue}`} href="/projects">
                    Дахин ачаалах
                  </a>
                  <a className={ui.sourceLink} href="https://d.parliament.mn/" target="_blank" rel="noopener noreferrer">
                    d.parliament.mn
                  </a>
                </>
              }
            />
          </div>
        )}
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
