import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SectionNav } from "@/components/layout/SectionNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Hero } from "@/components/home/hero/Hero";
import { ActivitySection } from "@/components/home/activity/ActivitySection";
import { LegislationSection } from "@/components/home/legislation/LegislationSection";
import { MembersBlock } from "@/components/home/members/MembersBlock";
import { StatsSection } from "@/components/home/stats/StatsSection";
import { NewsSection } from "@/components/home/news/NewsSection";
import { SectionSkeleton } from "@/components/ui/SectionSkeleton";
import { PetitionsSection } from "@/components/home/petitions/PetitionsSection";
import { CommitteesSection } from "@/components/home/committees/CommitteesSection";
import { YouthHomeBlock } from "@/components/youth/YouthHomeBlock";
import {
  getAttendanceStat,
  getCommittees,
  getComposition,
  getPetitions,
  getCurrentActivity,
  getLatestVotes,
  getMemberRoster,
  getNavigation,
  getNews,
  getProposals,
  getSessions,
  getWeeklySchedule,
} from "@/lib/data";
import { getReels } from "@/lib/reels";
import { getProjectsOverview } from "@/lib/projects/catalog";
import { load } from "@/lib/http";
import { parseProposalQuery } from "@/lib/normalize/proposals";
import { formatDate, formatTime, todayLocal } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ProposalQuery } from "@/lib/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SECTIONS = [
  { id: "odoo", label: t.sections.now },
  { id: "huuli", label: t.sections.laws },
  { id: "orgodol", label: t.sections.petitions },
  { id: "dadlaga", label: "Дадлага" },
  { id: "gishuud", label: t.sections.members },
  { id: "too", label: t.sections.stats },
  { id: "medee", label: t.sections.news },
];

async function LegislationLoader({ query, defaultYear }: { query: ProposalQuery; defaultYear: number }) {
  const [initial, projects] = await Promise.all([load("proposals", () => getProposals(query)), getProjectsOverview(3).catch(() => null)]);
  return <LegislationSection initial={initial} defaultYear={defaultYear} projects={projects} />;
}

async function MembersLoader() {
  const [roster, composition, sessions] = await Promise.all([getMemberRoster(), getComposition(), getSessions()]);
  const [attendance, committees] = await Promise.all([getAttendanceStat(sessions), getCommittees(roster.ok ? roster.data : null)]);
  return (
    <>
      <MembersBlock roster={roster} />
      <CommitteesSection committees={committees} />
      <StatsSection composition={composition} attendance={attendance} />
    </>
  );
}

async function PetitionsLoader() {
  return <PetitionsSection petitions={await getPetitions()} />;
}

async function NewsLoader() {
  return <NewsSection news={await getNews()} />;
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = todayLocal();
  const defaultYear = Number(today.slice(0, 4));
  const query = parseProposalQuery(sp, { year: defaultYear });

  const sessions = await getSessions();
  const [nav, current, schedule, votes, reels] = await Promise.all([
    getNavigation(),
    getCurrentActivity(sessions),
    getWeeklySchedule(),
    getLatestVotes(3),
    getReels().catch(() => []),
  ]);
  const now = new Date();

  return (
    <>
      <SiteHeader nav={nav} />
      <SectionNav links={SECTIONS} />
      <main id="main">
        <Hero current={current} reels={reels} today={today} />
        <ActivitySection schedule={schedule} votes={votes} />
        <Suspense fallback={<SectionSkeleton id="huuli" tone="light" height={1100} />}>
          <LegislationLoader query={query} defaultYear={defaultYear} />
        </Suspense>
        <Suspense fallback={null}>
          <PetitionsLoader />
        </Suspense>
        <YouthHomeBlock />
        <Suspense fallback={<SectionSkeleton id="gishuud" tone="dark" height={1200} />}>
          <MembersLoader />
        </Suspense>
        <Suspense fallback={<SectionSkeleton id="medee" tone="light" height={900} />}>
          <NewsLoader />
        </Suspense>
      </main>
      <SiteFooter generatedAt={`${formatDate(now)} ${formatTime(now)}`} />
    </>
  );
}
