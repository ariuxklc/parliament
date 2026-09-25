/**
 * Public, browser-safe URLs of official Parliament properties and the detail-page patterns we link to.
 * Route patterns were read from the new.parliament.mn router on 2026-09-25.
 */

export const PARLIAMENT_SITE = (process.env.NEXT_PUBLIC_PARLIAMENT_SITE_URL || "https://new.parliament.mn").replace(/\/$/, "");
export const LAWFORUM_SITE = (process.env.NEXT_PUBLIC_LAWFORUM_SITE_URL || "https://lawforum.parliament.mn").replace(/\/$/, "");

export const officialUrl = {
  home: () => `${PARLIAMENT_SITE}/`,
  member: (id: number) => `${PARLIAMENT_SITE}/member/${id}`,
  memberList: () => `${PARLIAMENT_SITE}/member/list`,
  news: (slug: string) => `${PARLIAMENT_SITE}/news/${encodeURIComponent(slug)}`,
  newsList: () => `${PARLIAMENT_SITE}/news/list`,
  meeting: (id: number) => `${PARLIAMENT_SITE}/meeting-info/${id}`,
  plenaryMeetings: () => `${PARLIAMENT_SITE}/meeting-info/plenary`,
  attendance: () => `${PARLIAMENT_SITE}/meetings/attendance/info`,
  votes: () => `${PARLIAMENT_SITE}/poll-votes-list`,
  vote: (id: number) => `${PARLIAMENT_SITE}/poll-votes-detail/${id}`,
  billBulletin: () => `${PARLIAMENT_SITE}/bill-bulletin`,
  committee: (id: number) => `${PARLIAMENT_SITE}/committee/${id}`,
  petitions: () => "https://petition.parliament.mn/",
  lawforumHome: () => `${LAWFORUM_SITE}/`,
  lawforumDrafts: () => `${LAWFORUM_SITE}/drafts`,
  lawforumProjects: () => `${LAWFORUM_SITE}/projects`,
  /** stage 0 → /draft/{id}/, stage 10 → /project/{id}/ (verified against the live LawForum list). */
  lawforumProposal: (id: number, stage: "drafting" | "submitted") =>
    `${LAWFORUM_SITE}/${stage === "drafting" ? "draft" : "project"}/${id}/`,
  openData: () => "https://data.parliament.mn/databases",
  legalInfo: () => "https://legalinfo.mn/",
};
