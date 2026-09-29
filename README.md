# Open Parliament

A Mongolian-language Parliament information prototype built for the Open Parliament Hackathon. It brings together official activity, draft legislation, submitted projects, member information, and youth opportunities. Ask Parliament AI answers questions using read-only lookups of official sources and attaches source links. This is a prototype, not an official Parliament service.

**Status:** This hackathon prototype is not actively maintained. Its external data sources and API access may change, so some features may stop working. It is not intended for production use.

## Run locally

Use Node.js 22 or newer (the project scripts use Node's TypeScript stripping) and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if needed. The public data sources have defaults, so you can start the site without filling in every variable. Some sections require access to the external official services and will show an unavailable state if those services cannot be reached.

Set `OPENAI_API_KEY` in `.env.local` to enable Ask Parliament AI and generation of new bill or project summaries. The authenticated Parliament API is optional and supplies agenda data only. Leave its credentials unset unless you have authorized access and an approved HTTPS endpoint: the URL in `.env.example` uses plain HTTP, which would send the login credentials without transport encryption. Keep `.env.local` private; it is gitignored.

## What is in the app

| Route | Purpose |
| --- | --- |
| `/` | Current activity, meeting schedule and votes, legislation browser, petitions, youth opportunities, members, committees, statistics, and news. |
| `/laws/[billId]` | LawForum bill detail, legislative journey, official material, AI explainer, opinion poll, and bill-aware chat. |
| `/projects` | Search and filter submitted projects from d.parliament.mn. |
| `/projects/[projectId]` | Project details, official documents, and a cached AI brief when one has been generated. |
| `/ask` | Ask Parliament AI chat with links to official sources. A compact version is also available in the sitewide chat dock. |
| `/dadlaga` and `/dadlaga/[id]` | Youth opportunity listings and applications. |
| `/dadlaga/status` | Application lookup and withdrawal using a tracking code and phone number. |
| `/dadlaga/admin` | Office and Secretariat management of listings and applications; sign-in is under `/dadlaga/admin/login`. |

The server routes under `src/app/api/` provide proposals, member details, chat, bill summaries, and bill opinion totals. Youth submissions and administration use Next.js server actions.

## Configuration

Copy [`.env.example`](.env.example) for the full set of variables. The key settings are:

| Variable | Use |
| --- | --- |
| `OPENAI_API_KEY` | Enables chat and new AI summaries. |
| `OPENAI_MODEL` | Model used for chat and summaries; defaults to `gpt-6-luna` in code. |
| `OPENAI_REASONING_EFFORT` | Optional chat reasoning effort; defaults to `medium`. |
| `PARLIAMENT_API_BASE_URL`, `PARLIAMENT_API_USERNAME`, `PARLIAMENT_API_PASSWORD` | Optional authenticated Parliament API access for agenda data. All three are required together; use only with authorized access and an approved HTTPS endpoint. |
| `LAWFORUM_API_BASE_URL` | Public LawForum API; has a default URL. |
| `NEXT_PUBLIC_PARLIAMENT_SITE_URL`, `NEXT_PUBLIC_LAWFORUM_SITE_URL` | Official site origins used for public data and links. |
| `YOUTH_SESSION_SECRET` | Optional signing secret for office sessions. Without it, a key is generated in `data/store/`. |
| `STAFF_PASSCODE` | Enables the shared Secretariat login for the youth admin area. |

Server credentials are read in server-only modules and are not sent to the browser. The chat endpoint validates requests, limits usage, and streams status and answer events as NDJSON. Its citations are resolved to official links on the server.

## Data and architecture

- `src/app/` contains App Router pages, API routes, and youth server actions.
- `src/components/` contains the homepage sections, bill and project views, chat UI, and youth forms.
- `src/lib/sources/` reads LawForum, the public API behind new.parliament.mn, and the optional authenticated Parliament API. `src/lib/normalize/` turns those responses into display models.
- `src/lib/projects/` reads submitted projects from d.parliament.mn. `src/lib/project-summaries/` extracts official files and generates validated, cached project briefs through an offline script.
- `src/lib/ai/` implements the tool-using chat; `src/lib/parliament/` provides read-only lookups for laws, bills, meetings, votes, members, and other official records.
- `data/` contains checked-in bill and project summaries plus local JSON data. `data/cache/`, `data/store/`, opinion votes, and uploaded videos are runtime data and are gitignored.

The project catalog keeps a local snapshot for temporary source outages. Bill explainers can be generated on first request and saved locally. Project briefs are generated ahead of time; the project pages only read cached briefs. Local JSON writes are intended for a single-process demo, not durable multi-instance hosting. In particular, youth applications contain personal information and need a proper database and operational controls before production use.

## Scripts

```bash
npm run dev            # development server
npm run build          # production build
npm run start          # serve a production build
npm run typecheck      # TypeScript check
npm run test:chat      # chat tests
npm run test:projects  # project tests
```

To prepare project briefs, first identify candidate project IDs, then inspect extraction before generating:

```bash
npm run projects:process -- --candidates 20
npm run projects:process -- --ids <project-uuid> --dry
npm run projects:process -- --ids <project-uuid>
```

Generation needs `OPENAI_API_KEY`; `--dry` does not call the model. `--force` regenerates an unchanged brief, and `--refresh-files` downloads its official files again. Results are written under `data/project-summaries/`.

For a local youth demo, `npm run youth:seed` creates a fictional office and five example listings. It prints the office password when the account is first created. Running it again replaces the demo listings **and their applications**, while preserving the office account and password. Use it only with disposable demo data.

## Further notes

- [Homepage data map and design notes](docs/HOMEPAGE.md)
- [Ask Parliament AI implementation notes](HANDOFF.md)
- [Ask Parliament demo questions](docs/ask-parliament-demo-qa.md)

These notes include historical decisions; the source code is authoritative when behavior has changed.

Local `output/`, `outputs/`, and `tmp/` folders contain generated work and are not part of the tracked source. Review their contents before adding files to Git.
