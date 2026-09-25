# Homepage — audit, data map and design system

Open Parliament Hackathon · homepage redesign (owner: Ariuka) · 2026-09-25

Run locally: `npm install && npm run dev` → http://localhost:3000 (needs `.env.local`, see `.env.example`).

---

## 1. What the sources say

| Source | What it asks for / tells us |
| --- | --- |
| `Open_Parliament_Feature_Todo` (team) | Youth (20–30) + CSOs. Plain-language access, bill discovery, Bill Journey, source links on everything, human review of AI summaries, no personal data. |
| `Open Parliament Hackathon` (team notes) | Roadmap: homepage → categorising proposals by time → blog layout → stats → AI. "Sort by year for the Parliament laws". |
| `БХАЭГ.pptx` (organizers) | Official 10-stage legislative process (used for the journey strip); 93.9% of the process is still paper-based; needs: status of bills in discussion, attendance info, committee meeting info. |
| `УИХТГ танилцуулга` (organizers) | AI must advise, humans decide; reliable data + human oversight first. |
| `ХТБХҮГ_AI_хэрэгцээ` (organizers) | Internal oversight/analysis needs — context only, not homepage scope. |

### Contradictions / things to align on

1. **Team doc assumes one source ("parlament.mn")**; in reality there are three: LawForum API (proposals), Parliament API (plenary agenda/votes, hackathon credentials) and the public JSON API behind new.parliament.mn (members, attendance, schedule, news, bulletin). The homepage uses all three.
2. **Parliament API `/Service` report functions** (members, attendance, BH) return empty data for hackathon accounts, although the docs list them. Member/attendance data therefore comes from new.parliament.mn.
3. **Parliament API auth** differs from its docs: the bearer token only works together with the `JSESSIONID` cookie from the login response.
4. **LawForum `stage`/`status` codes are undocumented.** We only display the exact labels lawforum.parliament.mn itself shows for those codes (verified record-by-record against the live list): stage 0 → "Боловсруулж буй · Санал авч байна" (`/draft/{id}`), stage 10 → "Өргөн мэдүүлсэн" (`/project/{id}`). `status 0` records are not listed publicly and are skipped. The AI assessment (`ASK_PARLIAMENT_AI_ASSESSMENT.md`) recommends not translating codes until Parliament confirms — worth confirming with organizers; the homepage deliberately does not infer anything beyond what the official site shows.
5. **LawForum has no session or submission date.** Its `publishedOnUtc` is the date the proposal appeared on LawForum, so the UI says "LawForum-д нийтлэгдсэн", never "өргөн мэдүүлсэн огноо".
6. **The organizer slide has two typos** in stage 1 ("сааначлах, болвсруулах"); corrected in `src/lib/lawStages.ts`.
7. **Bill bulletin is a snapshot** (2026-07-01 at the time of writing) — always shown with its date.
8. **Schedule endpoint returns the latest *approved* schedule**, which can be last week's — shown with its date range, not as "this week".

---

## 2. Homepage structure

`Header (official menu) → Sticky section nav → Hero (current session + 3 live tiles) → Хуралдааны тов (schedule columns, latest votes, bill bulletin) → Хуулийн төслүүд (time browser) → Гишүүд (roster + showcase) → Тоон мэдээлэл → Мэдээ → Footer (source statement)`

Ordering follows the brief's comprehension order: what is happening now → which laws are active → who the members are → how to explore further.

---

## 3. Data map — component → endpoint → fields

| Component | Source | Endpoint | Fields used |
| --- | --- | --- | --- |
| `SiteHeader` | new.parliament.mn | `GET /api/menu/header/` | label, external_url, linked_news_slug, sub[] |
| `Hero` (session) | new.parliament.mn | `GET /api/meeting/attendance_overview/` | sessions[].key/label/start_date/end_date/meeting_count |
| `Hero` (latest plenary) | new.parliament.mn | `GET /api/meeting/public/latest-meetings/` | plenary.id/date/location |
| `Hero` (live) | new.parliament.mn | `GET /api/meeting/public/live-video/` | video.is_live/video_url |
| `Hero` (open for comment) | LawForum API | `GET /api/v1/projects` (all pages) | stage=0, status=1, publishedOnUtc |
| `ScheduleColumns` | new.parliament.mn | `GET /api/parliament/schedules/latest/` | days[].sections[].events[].time/room/type/title/agenda_items, file_url |
| `LatestVotes` | new.parliament.mn | `GET /api/meeting/public-polls/?page_size=5` | name, total_for/against/voted, result_label, meeting_date |
| `BillBulletin` | new.parliament.mn | `GET /api/bills-public/` | category_display, committee_name, bulletin_snapshot_at |
| `LegislationBrowser` | LawForum API | `GET /api/v1/projects`, `GET /api/v1/projects/{id}` | title, typeId/typeTitle, categoryTitle, stage, status, publishedOnUtc, updatedOnUtc |
| `AgendaPanel` | Parliament API (auth) | `POST /ParliamentService {func:getAgendaList}` | agendaCode (YYYY+SS+NNNNN), agendaName |
| `MemberSection` | new.parliament.mn | `GET /api/parliament_members_list/` | first/last name, profile_image, party, positions |
| `MemberShowcase` | new.parliament.mn | `GET /api/parliament_member/detail/{id}/`, `GET /api/meeting/attendance_members/{id}/` | election_results, current_positions, cover_image; summary.present/total/on_time/late/… |
| `StatsSection` | new.parliament.mn | `GET /api/members/statistics/`, `GET /api/meeting/attendance_overview/` | party, sex, election; summary.average_attendance |
| `NewsSection` | new.parliament.mn | `GET /api/featured-news/`, `GET /api/news/articles/` | title, slug, category_name, cover_image, short_description, published_at |

Our own backend routes (credentials never leave the server):

- `GET /api/proposals?year&session&stage&type&sort&q&limit` — filtered, normalized proposals + period counts + plenary agenda.
- `GET /api/members/:id` — normalized member profile + attendance.

### Time model for proposals (`src/lib/normalize/proposals.ts`)

| Field | Derived from |
| --- | --- |
| `year` | `publishedOnUtc` converted to Asia/Ulaanbaatar |
| `session` | official session (attendance_overview) whose date window contains the publication date; open session extends to today |
| `updatedAt` | `updatedOnUtc` (else `createdOnUtc`) from the detail endpoint — fetched only for the "Сүүлд шинэчлэгдсэн" sort |
| `status` | `stage` 0 / 10 |
| `category` | `typeTitle` + `categoryTitle` |

Parliament API agenda codes carry the session: `YYYY01` = spring, `YYYY02` = autumn (verified from vote dates); `YYYY00` was only a test meeting and is excluded.

URL state: `/?year=2025&session=2025-fall&stage=submitted&type=1&sort=oldest&q=татвар#huuli` — shareable, restored on load.

### Deliberately **not** shown

- Age distribution (37 of 126 members "Тодорхойгүй").
- Per-member vote breakdown ("Ирцэд бүртгүүлээгүй" mixes several situations).
- The site's "at risk" attendance list — a ranking, not a fact.
- Any rating, score or ranking of members.

---

## 4. Design system

- **Identity kept from new.parliament.mn:** primary blue `#00379B`, gold `#FFC700`, canvas `#ECEDEF`, ink `#1A1A1A`, State Emblem + two-line uppercase wordmark, red–blue–red flag stripe under the header, uppercase blue section titles with a gold ornament rule, pill quick-links (now a sticky section nav), official photography (State Palace aerial from the organizers' deck).
- **Type:** Golos Text (open licence, full Mongolian Cyrillic) standing in for SF Pro Display, which cannot be redistributed. Uppercase only for section titles/labels.
- **Grid:** 1320 px max container, fluid gutters (16–40 px), section rhythm `clamp(64px, 8vw, 112px)`.
- **Radii:** 6 / 10 / 16 px; pills for filters (as on the official site). Shadows are low and blue-tinted.
- **Motion:** 150 / 260 / 440 / 720 ms, ease-out `cubic-bezier(.22,.8,.24,1)`. Transform + opacity only. One shared IntersectionObserver for reveals, one rAF scroll loop for parallax (hero photo, emblem watermark, lead news image; max drift 36–110 px). `prefers-reduced-motion` disables parallax, reveals, count-ups and smooth scroll. Content is only hidden for reveal when JS is running.
- **Hover language:** "highlight one, the rest step back" — cards lift 3–6 px with a gold/party rule; neighbours fade (`:has()`); schedule days widen while others compress; the year rail and journey steps respond on hover and keyboard focus.
- **Members:** the roster is a set of player cards (portrait, name, party, short role). Hover/focus lifts the card, pushes the portrait in, a spotlight follows the pointer and the committee line slides up; the side showcase animates to the full profile (constituency, committees, attendance with official status labels). On touch devices the committee line is always visible and tapping opens a bottom sheet.
- **Mobile:** single column, schedule becomes an accordion, rails/tabs scroll horizontally, member grid 2-up, no hover-only information.

---

## 5. Bill page integration (2026-09-25)

- Homepage bill cards open our bill page `/laws/{id}` (same tab); a small "LawForum ↗" link on each card keeps the official record one click away. Header logo now links to `/` on every page.
- **Bill Journey** (`src/components/bill/BillJourney.tsx`, rules in `src/lib/normalize/journey.ts`) is rendered on `/laws/[billId]` — the only edit to the Ask Parliament AI page is its import + one `<BillJourney bill={bill} row={row} />` line.
- Journey rules (checked against all 98 bulletin rows, 0 violations): "…явуулсан" entries = completed; the last entry without "явуулсан" = stage the bill is waiting at (never shown as completed — 10 bills sit at "Эцэслэн батлах" pending); labels that are not one of the 10 official stages ("Хэлэлцэх", "Хоёр дахь хэлэлцүүлэг", "Зөвшилцөх") are shown verbatim, not placed; earlier stages without a record are "passed" with no date; nothing beyond the furthest record is inferred. Output agrees with the chat's stage answers (same records, no extra interpretation).

## 6. Citizen features added (2026-09-25)

| Feature | Where | How it works |
| --- | --- | --- |
| **30 секундэд** summary + **Энэ танд хамаатай юу?** | bill page (top), homepage block after the hero | Drafted by the AI model (`OPENAI_MODEL`, gpt-6-luna) from the official LawForum clauses (`src/lib/summaries/generate.ts`). The server keeps only sentences that cite a given clause and whose numbers appear in it. Saved as a **draft**; shown publicly only after a person approves it on `/review`. Each sentence links to its clause. |
| Human review | `/review` (not linked publicly; dev mode or `REVIEW_TOKEN`) | Generate → edit next to the source clauses → tick "checked against sources" + name → approve. Unpublish at any time. |
| Video | bill page card + homepage block | Upload MP4/WebM/MOV (≤250 MB) or paste a YouTube/other link in `/review`. Hidden until set. |
| Support / oppose | bill page, under the journey | Anonymous (random httpOnly cookie, stored only as a hash), one vote per browser per bill, changeable. Results only after voting; bar only from 10 votes. Labeled "not official, not representative" with a link to LawForum's official comments. |
| Нийтийн өргөдөл | homepage (`#orgodol`) | 4 most-supported petitions from petition.parliament.mn (HTML feed; petitioner names/photos deliberately not shown). |
| Байнгын хороод | homepage (`#horoo`) | 8 standing committees with chair and member count from the official member list. |

Storage (laptop demo): `data/summaries/*.json` (explainers, can be committed), `data/opinions.json` and `data/videos/` (git-ignored). An online deployment needs a database instead of these files.

## 7. Open items / TODO

- `summary` slot on `Proposal` is reserved for human-reviewed AI summaries (`TODO(ai-summaries)` in `BillCard.tsx`).
- English dictionary: add `en` to `src/lib/i18n` with the same shape as `mn.ts`.
- Confirm LawForum stage/status semantics with organizers (see §1.4).
- News list endpoint is slow (10 s+ at times); the section degrades to featured items only.
