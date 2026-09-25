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

## 2. Homepage structure (minimal redesign, 2026-09-25)

`Header (official menu) → Sticky section nav → Hero (session in one line + reels) → Хуралдааны тов (the week: date + what meets; 3 latest votes) → Хуулийн төслүүд (years, sessions, list; entry to /projects) → Нийтийн өргөдөл → Залуучуудын дадлага → Гишүүд → Байнгын хороод → Их Хурал тоогоор → Мэдээ → Footer`

Why (feedback from Ariuka's reviewers): too much text and too many boxes for an average visitor. Each section now shows one idea at a glance; detail is one click away (a day in the schedule opens its meetings; a bill opens its page).

Removed from the homepage: the three hero tiles (replaced by the reels; the latest plenary is one quiet line), the "30 секундын AI тайлбар" teaser (it lives on each bill page only), the bulletin + per-committee bars, the 10-stage strip above the bill list (each bill page has its own journey) and the plenary agenda side panel ("Нэгдсэн хуралдаанаар хэлэлцсэн асуудал").

### Reels (hero)

`src/components/home/hero/ReelStack.tsx`, list in `data/reels.json` (loader `src/lib/reels.ts`). Cards are stacked like photos held in one hand; the top one plays, the next two wait behind it, moving on sends the top card off to the left. Segmented progress bar, pause button, arrows, swipe, ←/→ keys.

- Add a video: put `public/videos/<name>.mp4` and add `{ "kind": "file", "src": "/videos/<name>.mp4", "title": "…", "billId": 11151 }` (billId adds "Төслийг үзэх →"). Files autoplay muted and advance when they end. A missing file is skipped, so the 11151 entry already waits for `public/videos/11151.mp4`.
- Also accepted: `"kind": "youtube"` (Shorts link, autoplays muted) and `"kind": "instagram"` (reel link). Embeds cannot report their end, so they advance after `seconds` (default 10), unless the visitor hovers, clicks into the video, presses pause or scrolls away. Only these three kinds are accepted, each rebuilt into a fixed embed URL.
- Test entries (`"test": true`) are public Instagram reels (@mongolianparliament, @urug_mn, @newsroommongolia) standing in until the team's own videos exist. Instagram embeds load Instagram's scripts and show its header — fine for testing, replace for the demo.
- Reduced motion: starts paused; nothing moves unless the visitor asks.

### Chat in the corner (Хийморь)

`src/components/assistant/ChatDock.tsx` (+ `Mascot.tsx`, `chatDock.module.css`), mounted in `src/app/layout.tsx`, replaces the old floating launcher. A messenger-style panel for Ask Parliament AI: mascot launcher with a one-time hello, blue header with the mascot's live face, bot/user bubbles, quick-reply chips (starters, then follow-ups), typing dots with the current lookup, answers with numbered citations, a folded source list and "Хуулбарлах". Same `/api/chat` protocol and the same sessionStorage conversation as the full chat on `/ask`. Hidden on `/ask` and `/laws/*`, which embed the chat. Full screen on phones.

Mascot sprites: `public/images/mascot/horse-bust.webp` (launcher) and `horse-head.webp` (avatars), both 4 × 6 frames cut from Ariuka's sheet (256 px cells; bust = cell crop x16 y4 240², head = x92 y6 160²). Moods (frame numbers in `Mascot.tsx`): idle 0 with a blink (2) every few seconds, listening 5 while typing, looking up 8/9/13/10 while the answer is prepared, laugh 14 when it arrives, worried 21 on errors, greeting 17 on hover.

### Залуучуудын дадлага (/dadlaga)

Ported on 2026-09-26 from `origin/feature/youth-dadlaga` (commits e4a8ea2, 0a01d0c) — only this feature, not the staff area or the other commits on that branch. High-school students browse listings from MP offices (shadow a day, short internship, research, volunteering, events), tick the time slots they can make and apply with parent contact + consent; they get a tracking code for `/dadlaga/status` (code + phone), where they can also withdraw. Each MP office has its own login (`/dadlaga/admin`) to manage listings and applications; the Secretariat signs in on the same page with `STAFF_PASSCODE` (off when unset) and sees everything.

- Homepage: `YouthHomeBlock` (`#dadlaga`, after petitions) — the four steps, "Бүх зар" and "Бүртгэлээ шалгах", and the three listings closing soonest as hairline rows. Header menu: "Залуучуудын дадлага" with a small gold dot (our own section, after the official menu).
- Restyled to the site's minimal style (`youth.module.css`, `forms.module.css`); the shared pieces it borrowed from the other branch are local now (`youth/Panel.tsx`, `youth/submit.ts`, `lib/staff-auth.ts`).
- Storage: `data/store/` (gitignored — applications hold minors' personal data, office logins and the session key). Demo: `npm run youth:seed` adds a fictional office and five listings marked "Жишээ зар"; the office login is printed once when it is created.
- Env names (optional): `YOUTH_SESSION_SECRET`, `STAFF_PASSCODE`.

### Readable titles

LawForum, petitions and Цахим парламент titles often arrive in ALL CAPS. `src/lib/text/readable.ts` → `readableTitle()` turns shouting chunks into sentence case for display only (acronyms such as УИХ, ХК kept; "Монгол Улс", "Улсын Их Хурал" re-capitalised; parenthesised and /slash/ notes judged separately). Used on the homepage rows, /laws and /projects.

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

- **Palette (new.parliament.mn):** primary blue `#00379B`, deep blue `#0A2466` (hero, footer), gold `#FFC700` used only as an accent (ornament, active underline, open-session dot, plenary days), canvas `#ECEDEF` alternating with white sections. No gradients except the photo shade.
- **Identity:** State Emblem + wordmark, red–blue–red flag stripe, the gold two-segment ornament above section titles (sentence case now, not uppercase), official photography (State Palace aerial) and a thin traditional key-pattern band (`.meander` in `globals.css`) on the hero's bottom edge and the footer's top edge.
- **Type:** Golos Text. Titles 800 weight, body 15–17 px; long official titles are shown in sentence case (see §2).
- **Minimal rules:** lists with hairline dividers instead of card boxes; one line of meta per item; counts in muted small type; one source line per section; selects and filters as quiet text controls; no chips with logos.
- **Grid:** 1320 px max container, fluid gutters (16–40 px), section rhythm `clamp(56px, 7vw, 96px)`.
- **Motion:** transform + opacity only; reels (card stack), row entrances when the period changes, member card lift with neighbours stepping back, hero photo parallax. `prefers-reduced-motion` stops parallax, reveals, count-ups and the reels' auto-advance.
- **Members:** light cards (portrait, name, party, role label), 6 across on desktop. Hover only lifts a card a little; pressing a person opens their full card in a dialog (centred on desktop, bottom sheet on phones). No side panel that changes while the pointer moves.
- **Mobile:** single column, schedule days become rows (date left, meetings right), year/session/stage tabs scroll sideways, reels centred under the copy with arrows on the card edges, no hover-only information.

## 5. Bill page integration (2026-09-25)

- Homepage bill cards open our bill page `/laws/{id}` (same tab); a small "LawForum ↗" link on each card keeps the official record one click away. Header logo now links to `/` on every page.
- **Bill Journey** (`src/components/bill/BillJourney.tsx`, rules in `src/lib/normalize/journey.ts`) is rendered on `/laws/[billId]` — the only edit to the Ask Parliament AI page is its import + one `<BillJourney bill={bill} row={row} />` line.
- Journey rules (checked against all 98 bulletin rows, 0 violations): "…явуулсан" entries = completed; the last entry without "явуулсан" = stage the bill is waiting at (never shown as completed — 10 bills sit at "Эцэслэн батлах" pending); labels that are not one of the 10 official stages ("Хэлэлцэх", "Хоёр дахь хэлэлцүүлэг", "Зөвшилцөх") are shown verbatim, not placed; earlier stages without a record are "passed" with no date; nothing beyond the furthest record is inferred. Output agrees with the chat's stage answers (same records, no extra interpretation).

## 6. Citizen features added (2026-09-25)

| Feature | Where | How it works |
| --- | --- | --- |
| **AI товч тайлбар** (summary + **Энэ танд хамаатай юу?**) | bill page only: directly under the 10-stage journey (summary first, the rest behind "Дэлгэрэнгүй"). Removed from the homepage in the minimal redesign. **Fallback only**: the submitted-projects session's document-based brief replaces it in the same slot where available (see §6 note) | Written automatically by the AI model (`OPENAI_MODEL`, gpt-6-luna) the first time a bill page is opened (~6–10 s, skeleton shown), then cached in `data/summaries/<id>.json` for 30 days. Built only from the official LawForum clauses; the server keeps only sentences that cite a given clause and whose numbers appear in it. Labeled **"AI · хүн хянаагүй"**; each sentence links to its clause. Limits: 6 new summaries per visitor / 10 min, 300 per day, one model call per bill at a time. The homepage never triggers generation. |
| Video | homepage reels (`data/reels.json`) + inside the bill's AI box | No tool: put `public/videos/<billId>.mp4` (or `.webm`), or add `{ "<billId>": "https://youtube.com/…" }` to `data/videos.json`. Hidden until present. |
| Support / oppose | bill page, under the journey | Anonymous (random httpOnly cookie, stored only as a hash), one vote per browser per bill, changeable. Results only after voting; bar only from 10 votes. Labeled "not official, not representative" with a link to LawForum's official comments. |
| Нийтийн өргөдөл | homepage (`#orgodol`) | 4 most-supported petitions from petition.parliament.mn (HTML feed; petitioner names/photos deliberately not shown). |
| Байнгын хороод | homepage (`#horoo`) | 8 standing committees with chair and member count from the official member list. |

Storage (laptop demo): `data/summaries/*.json` (cached AI summaries, can be committed), `data/opinions.json` (git-ignored). An online deployment needs a database instead of these files.

Split agreed with the "Legislative projects browser feature" session (2026-09-25): it owns `/projects`, document discovery/extraction and the document-based AI brief (`src/lib/project-summaries/`, `src/components/projects/`); this area owns `/laws/{id}` placement. Its cached brief (`getProjectBriefByLawforumId`) will be rendered in the slot under the journey, with `src/lib/summaries` as the fallback. `BillJourney` accepts optional `model`/`sourceNote` for its pages.

Decision (2026-09-25, Ariuka): no internal review tool for the demo — summaries are published automatically and labeled as unreviewed AI output. The team doc's P0 "human review before publishing" is therefore not enforced; the `status: "approved"` flag still exists if review is added later.

## 7. Open items / TODO

- `summary` slot on `Proposal` is reserved for human-reviewed AI summaries (`TODO(ai-summaries)` in `BillCard.tsx`).
- English dictionary: add `en` to `src/lib/i18n` with the same shape as `mn.ts`.
- Confirm LawForum stage/status semantics with organizers (see §1.4).
- News list endpoint is slow (10 s+ at times); the section degrades to featured items only.
