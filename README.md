# Lodestar

*Find your direction.*

From discovery to a submitted application: Lodestar tells students what research
opportunities exist, what they're actually eligible for, who to contact, and what to send —
and lets them work on applications together with teammates.

Built for CampusOPS (IEEE BPDC), Problem Statement 03: Research Opportunity Aggregation &
Discovery Platform.

Formerly called ScholarRadar. Some internal identifiers keep the old name on purpose, because
renaming them would break existing data or integrations: the SQLite file (`scholarradar.db`), the
public API field `scholarradar_url`, the widget's `data-scholarradar-widget` attribute, calendar
event UIDs (`…@scholarradar`), the scraper's `ScholarRadarBot/1.0` User-Agent (sites' robots.txt
rules may name it), logger names, and the placeholder `@scholarradar.local` email defaults.

## Live demo

**Open https://lodestar-campusops.vercel.app**

| | URL |
|---|---|
| Site (Vercel) | https://lodestar-campusops.vercel.app |
| API (Render) | https://lodestar-api-9lvk.onrender.com ([health](https://lodestar-api-9lvk.onrender.com/api/health)) |

The live API runs with AI on (Gemini). It's on Render's free plan, so after 15 minutes idle the
first visit shows a "Waking up the server" card for about a minute, then the site carries on by
itself. Restarts reset the data to the seeded demo.

**Demo accounts** (password `demo1234`):

| Account | What to look at |
|---|---|
| `student@demo.com` | Dashboard, Discover, an opportunity, Professors, the shared Application File |
| `teammate@demo.com` | Same shared file: sees edits, tracker moves and activity |
| `faculty@demo.com` | Review queue (`/faculty/review`) and endorsements (`/faculty/endorse`) |
| `admin@demo.com` | Analytics, sources, digest and demo controls (`/admin`) |

[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) walks through a 3-minute demo. UI work follows
[`DESIGN.md`](DESIGN.md), the design system as built.

## Run locally (backup)

If the live site is down, run it on your machine. Needs Python 3.11+ and Node 18+.

```bash
make setup     # backend venv + deps, frontend npm install, .env files
make migrate   # create the database schema (SQLite)
make seed      # demo users, 58 source pages through the real pipeline, demo files
make dev       # backend on :8000, frontend on :3000
```

**Windows (PowerShell, no `make` needed):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1   # setup + migrate + seed
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1     # opens backend + frontend windows
```

Open http://localhost:3000 and use the same demo accounts. The browser only talks to the Next.js
server, which proxies `/api/*` and `/feed.xml` to FastAPI (`frontend/next.config.mjs`), so the
session cookie is first-party.

No API keys are needed locally. Without an LLM key the app runs in **demo mode** (banner at the
top): rule-based extraction, CV parsing and query parsing, and template drafts. To turn AI on, set
in `backend/.env` either `LLM_PROVIDER=gemini` + `LLM_API_KEY` (free key from
https://aistudio.google.com/apikey) or `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`.

Tests: `make test` (139 backend tests). Production build check: `make build`.

## Status

All phases of [`docs/SPEC.md`](docs/SPEC.md) Section 10 are built:

- [x] Phase 0 — Scaffold
- [x] Phase 1 — Accounts & progress
- [x] Phase 2 — Application Files & teammates
- [x] Phase 3 — Scraping pipeline
- [x] Phase 4 — Matching
- [x] Phase 5 — Action features
- [x] Phase 6 — Engagement & trust
- [x] Phase 7 — Institutional & integration
- [x] Phase 8 — Polish

## Infra notes

The original build environment had no Docker, PostgreSQL or Homebrew, so the infra layer
was adapted to equivalents that need no system-level install, while every feature, route, and
data model from the spec is built as specified:

| Spec | This build | Why |
|---|---|---|
| PostgreSQL 16 + pgvector | SQLite + embeddings as JSON, cosine similarity in Python (numpy) | No Postgres/Docker available. At this data scale (dozens–low hundreds of rows) a Python cosine scan is plenty fast, and it keeps the whole stack to one file with no server process to run. |
| `docker compose up` | `make dev` / `scripts\dev.ps1` | No Docker in the build environment. `docker-compose.yml` + `docker/*.Dockerfile` (Postgres 16) exist but are **unverified**. |
| Node via system package manager | Official Node.js tarball extracted into `.node/` (gitignored, not committed) | No Homebrew. Run `make setup` and it's handled for you. |
| Demo mode uses cached outputs from `seed/cache/` | Rule-based extraction/CV/query parsing and template drafts | They work on any input, not just pre-cached ones, and report lower confidence so weak extractions still reach the review queue. `seed/cache/` holds the offline professor sample and the real-results snapshot. |
| Playwright fallback for JS-rendered pages | Stubbed hook in `services/scraper.py`; flags `pending_review` instead | Avoids an uninvited ~300MB browser-binary download; wire up on request. |
| python-telegram-bot, `ics` library | Bot API over httpx (long polling); RFC 5545 written directly | Fewer dependencies for two small, stable protocols; both are unit-tested. |

If you have Docker, Node, and Postgres available, the files under `docker/` and the
`DATABASE_URL` setting in `.env.example` are the starting point for switching back to the
literal spec'd stack — nothing in the application code assumes SQLite specifically beyond the
embeddings-as-JSON representation in `backend/app/services/embeddings.py`.

**shadcn/ui + React 18 note:** this Next.js version pins React 18 (Next 14's official peer
dependency), but `shadcn@latest`'s default "Nova" component preset assumes React 19's automatic
ref forwarding and ships several `components/ui/*.tsx` files as plain function components where
Radix needs a ref (e.g. `Button`, dialog/sheet/alert-dialog `Overlay`). Those specific
components were patched to use `React.forwardRef` explicitly. If you add a new shadcn component
later and see a browser console warning like *"Function components cannot be given refs"*,
that's this same issue — wrap the affected component in `forwardRef` the same way.

## Scraping pipeline (Phase 3)

`backend/app/services/scrape_pipeline.py` runs each source through fetch → skip-if-unchanged →
extract → embed → dedupe → change detection, and logs every run to `scrape_runs`.

- **Fetching** (`services/scraper.py`): robots.txt checked first, `ScholarRadarBot/1.0` User-Agent
  with `SCRAPER_CONTACT_EMAIL`, max 1 request / 2 s per domain, 15 s timeout, exponential backoff.
- **Extraction** (`services/extractor.py`): with an LLM key set, the model
  (`EXTRACTION_MODEL`) returns JSON validated by Pydantic; invalid output is retried once, then
  flagged `pending_review`. Without a key (demo mode), a rule-based extractor runs instead, at
  honestly lower confidence scores. Anything under 0.7 confidence or with no deadline goes to
  `pending_review`.
- **Dedupe (F7):** cosine > 0.9 on the embedding, plus the same organization or a deadline
  within ±3 days. The duplicate is kept as a row pointing at its canonical opportunity, so every
  source stays linked ("Found on N sources").
- **Change detection (F5):** deadline, eligibility, funding and status are diffed on each
  re-scrape and recorded with a readable summary, e.g. "Deadline extended: 29 Dec 2026 → 12 Jan
  2027". If content changes, faculty verification is cleared. User notifications for these
  changes arrive in Phase 6.
- **Freshness (F6):** two 404/410 responses in a row → `broken`, hidden from students. A daily
  job sets `expired` once the deadline passes. Students only ever see `active` items (plus
  `expired` with `include_expired=true`); faculty and admins see everything.
- **Scheduler:** APScheduler re-scrapes every 6 h and runs the expiry sweep daily (the weekly
  digest job is a stub until Phase 6). Set `ENABLE_SCHEDULER=false` to turn it off.
- **Seed data:** 53 source pages (17 UAE/GCC) go through the same `ingest_page_text` path as a
  live scrape. Some deadlines are written as `{{today+N}}`, so every reseed produces
  near-deadline and just-expired items. **Seed entries are illustrative. Verify each one
  against the real source before any real use.**

API (Phase 3): `GET /api/opportunities` (`include_expired`, `degree_level`, `field`, `type`,
`q`), `GET /api/opportunities/{id}`, `GET /api/opportunities/{id}/changes`,
`POST|DELETE /api/opportunities/{id}/save`, and admin/faculty `GET|POST|PATCH /api/sources`,
`POST /api/sources/{id}/scrape`, `GET /api/sources/runs/recent`, `POST /api/sources/archive-sweep`.
The UI for these (discover, opportunity page, admin) arrives in Phases 4 and 7.

## Matching (Phase 4)

- **CV upload (F1):** `POST /api/profile/cv` parses PDF/DOCX in memory (the file is never written
  to disk), keeps only the extracted text, and returns suggested profile values. The onboarding
  wizard's first step shows them; nothing is saved until the student reviews each step. Try it with
  `frontend/public/sample-cv.docx` (a fictional student).
- **Eligibility (F1):** `services/eligibility.py` is deterministic: degree level, year bounds,
  CGPA with scale conversion (7.5/10 ≈ 3.0/4), nationality, residency, English tests (any one listed
  test suffices). Fields are matched with a synonym table (`services/fields.py`); with an API key,
  the single-opportunity view also asks the LLM about pairs the table can't decide. Verdicts:
  eligible / partially eligible (with what's missing) / not eligible (with the reason) / unknown.
- **Match score (F2):** `services/matcher.py`: 45% semantic + 25% eligibility + 15% field overlap +
  10% deadline feasibility + 5% funding, plus the top 3 reasons in plain language.
- **Natural-language search (F8):** `POST /api/opportunities/search` with `{q}` interprets the query
  (Claude with a key, a rule-based parser otherwise) into filters shown as removable chips; sending
  `{filters}` applies them as-is. Results rank by semantic similarity to the leftover query text plus
  match score; ones the student isn't eligible for drop lower but stay visible with the reason.
- UI: `/discover`, `/opportunities/[id]`, the CV step in `/onboarding`, and the dashboard's
  "Top matches", "Deadlines this week" and "Near you: UAE & GCC" tiles.

## Action features (Phase 5)

- **Professor & lab finder (F3):** `services/semantic_scholar.py` searches recent papers, groups
  them by author, ranks by relevance, recency and citations, and highlights BITS Pilani and UAE
  affiliations. Results are cached 7 days in `api_cache`; 429s back off exponentially. The public API
  rate-limits hard without a key (`SEMANTIC_SCHOLAR_API_KEY` raises it). Because the free host's
  disk (and so the cache) resets on restart, `seed/cache/professors_snapshot.json` holds real results
  for ~30 common searches (the demo student's interests, each opportunity's "Find professors"
  query, popular topics); the seed loads it into `api_cache`, so those searches show real
  researchers even when the API is rate-limited. Refresh it from a laptop with
  `python -m app.snapshot_professors` (fills in missing searches; `--refresh` re-fetches all) and
  commit the JSON. If a search is neither live nor cached, the UI shows a clearly labelled set of
  **fictional** sample researchers from `seed/cache/professors_sample.json`.
- **Application copilot (F4):** `POST /api/copilot/kit` writes a checklist, SOP draft and cold email
  (under 150 words, referencing one of the professor's papers) into an Application File, creating
  one if needed, and puts the opportunity in the tracker as "preparing". `POST /api/copilot/draft`
  writes a single document (used by "Generate first draft with AI" in New Document). Prompts live in
  `backend/app/prompts/` and forbid inventing achievements; drafts start with an "AI draft — edit
  before sending" label. Without an API key, templates built only from profile facts are used, with
  `[bracketed]` gaps instead of made-up stories.
- **Tracker (F9):** Kanban on the file's Tracker tab (dnd-kit, mouse and keyboard), positions
  persisted via `POST /api/workspaces/{id}/tracker/reorder`. Cards show a deadline countdown (red
  under 7 days), assignee and eligibility; assigning notifies the teammate. Moving a card to
  Accepted/Rejected asks for an outcome (`POST /api/outcomes`, optionally shared anonymously).
- **Calendar:** `.ics` per opportunity and per file, with alarms 7 days and 1 day before.
- **Compare:** "Add to compare" on an opportunity's page puts it in a side-by-side table at
  `/compare` (up to 4, kept per user in the browser's localStorage). The page shows summary cards
  (best match, closes first, eligible now), a "Show differences only" toggle, "Best here" marks per
  row, and up to 3 researchers per opportunity from `GET /api/professors/compare?ids=a,b,c`
  (max 4 ids). That endpoint **never calls Semantic Scholar live**; it resolves each opportunity's
  query in this order: saved Semantic Scholar results (the seeded snapshot / cache, any age) →
  cached AI suggestions (`api_cache` namespace `llm_professors`, 7 days) → ask the LLM
  (`prompts/professor_suggestions.md`: real, publicly known researchers only, fewer or none when
  unsure; validated, retried once, rate-limited to 8 per user per minute) → the fictional sample.
  Each result carries `source: cache | ai | sample` and the UI labels it.
- Also: documents poll every 10 s and show "Last edited by X"; checklist documents have clickable
  checkboxes; the `/files` list shows members, opportunity count, nearest deadline and last activity.

## Engagement & trust (Phase 6)

- **Notifications:** bell in the nav (unread count, mark read), dashboard tile. Sent for invites,
  tracker assignments, change alerts, endorsements and digests.
- **Change alerts (F5):** every recorded change (re-scrape, expiry sweep, broken link, or a faculty
  correction in the review queue) notifies everyone who saved the opportunity, a merged duplicate of
  it, or belongs to a file that tracks it, e.g. "Deadline extended: 29 Dec 2026 → 12 Jan 2027".
- **Digest + Telegram (F10):** weekly job (and **Send digest now** on the admin page) sends new
  matches above 70, deadlines in the next 7 days and changes to followed opportunities: in-app always,
  by email if SMTP is configured, on Telegram if `TELEGRAM_BOT_TOKEN` is set and the chat is linked.
  The bot (`services/telegram_bot.py`) long-polls the Bot API directly with httpx (no webhook or extra
  library); link a chat with the one-time code from Settings and `/start <code>`, then use `/matches`,
  `/deadlines`, `/digest`. Preferences live in Settings.
- **Review queue (F6):** `/faculty/review` shows extractions under 0.7 confidence or without a deadline,
  side by side with the stored page text and per-field confidence. Approve marks them "Verified by
  BPDC faculty"; reject hides them from students. Also lists live-but-unverified and broken listings.
- **Endorsements (F12):** `/faculty/endorse` lets faculty recommend an opportunity with a note and a
  target audience (degree, year, major). Matching students are notified, cards show "Recommended by
  Dr. X", and endorsed items get a +5 ranking boost for those students.
- **UAE/GCC (F11):** "Open to UAE residents" filter on Discover and the dashboard's "Near you: UAE &
  GCC" tile; 17+ regional sources in the seed.
- Fixes: password-reset links are only returned in the API response when SMTP isn't configured and
  `ENV != production` (previously any keyless deployment exposed them); logout/login clear the client
  cache so a second user never sees the first one's data; account deletion now removes saved items,
  outcomes and notifications and hands shared files to a teammate instead of leaving orphaned rows.

## Institutional & integration (Phase 7)

- **Admin analytics (F13), `/admin`:** headline stats (sources monitored, active opportunities,
  verified %, average extraction confidence, students with at least one application), anonymous
  success stories ("3 BPDC students were accepted to DAAD RISE this year"), charts for type, field,
  funding and region, new opportunities per week, saves and applications per week, top student
  interests, and outcomes per term, each with a data-table view. **Export CSV** downloads every
  table. The page also manages sources (add, enable/disable, **Scrape now**), shows recent scrape runs
  and broken listings, and has **Send digest now** and **Run expiry sweep** for the live demo.
  Charts use a validated colour-blind-safe palette (`--series-*` tokens in `globals.css`).
- **Public API (F14):** `GET /api/public/opportunities?degree=&field=&type=&region=&limit=` and
  `GET /api/public/opportunities/{id}`: active, open listings only, no personal data, CORS `*`.
  Everything else keeps credentialed CORS locked to `FRONTEND_ORIGIN` (`PathCORSMiddleware` in
  `main.py`).
- **RSS:** `/feed.xml` (same filters).
- **Widget:** `<script src="https://<your-lodestar>/widget.js" data-degree="bachelors"
  data-field="computer science" async></script>` renders a compact list in a Shadow DOM, immune to
  the host page's CSS, and links back to Lodestar. Attributes: `data-degree`, `data-field`,
  `data-type`, `data-region`, `data-limit` (1-20), `data-title`.
- **Mock portal:** `/demo/portal` is a fictional university portal (deliberately hostile CSS)
  embedding two widgets.
- Seed adds listings discovered across the last 12 weeks and 8 fictional past students
  (`cohort1..8@demo.com`) with saves, applications and outcomes, so the charts have data.
- Alembic migration `0107c6680fc6` adds the Phase 5-7 tables and user columns; `alembic check`
  reports no drift.

## Tech stack

- **Frontend:** Next.js 14 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui, TanStack
  Query, dnd-kit, Recharts.
- **Backend:** FastAPI (Python 3.10+), SQLAlchemy 2 + Alembic (batch mode, SQLite-compatible),
  Pydantic v2.
- **Database:** SQLite (see Infra notes above).
- **Auth:** email + password (argon2), JWT in an httpOnly `SameSite=Lax` cookie; roles
  `student`, `faculty`, `admin`.
- **AI:** `LLM_PROVIDER` = `anthropic` (Anthropic SDK; defaults `claude-haiku-4-5-20251001` /
  `claude-sonnet-5-5`), `gemini` (free tier, OpenAI-compatible endpoint; default
  `gemini-flash-lite-latest`) or `openai_compatible` (any OpenAI-style API via `LLM_BASE_URL`).
  `EXTRACTION_MODEL` covers extraction/parsing/classification, `WRITING_MODEL` SOP/email
  drafting. Demo mode (no external calls) when the provider has no key.
- **Embeddings:** all-MiniLM-L6-v2 via fastembed (ONNX Runtime, no torch); the API peaks
  around 250 MB RAM.

## Repository layout

```
campusOn/
  Makefile
  docker-compose.yml   # unverified
  scripts/             # setup.ps1, dev.ps1 (Windows)
  .env.example
  README.md
  DESIGN.md            # design system (tokens, typography, bento, cards, don'ts)
  CLAUDE.md            # instructions for AI coding assistants
  docs/                # SPEC.md (product spec), DEMO_SCRIPT.md (3-minute demo)
  backend/
    app/            # main, config, db, models/, schemas/, routers/, services/, jobs/, prompts/
    seed/           # opportunities.json (58 illustrative listings), cache/ (professor sample + snapshot)
    alembic/
    tests/
  frontend/
    app/            # App Router pages; globals.css holds all design tokens
    components/     # ui/ (shadcn), bento/, brand/, home/, discover/, opportunity/, workspace/, ...
    lib/            # API client, React Query hooks, types, formatting
    public/         # widget.js, sample-cv.docx, PWA icons
    scripts/        # generate-icons.mjs (dev-only, uses sharp)
  docker/           # backend/frontend Dockerfiles (unverified)
```

## Deployment

Live: frontend at https://lodestar-campusops.vercel.app, backend at
https://lodestar-api-9lvk.onrender.com.

- **Backend → Render (free):** render.com → New → Blueprint → this repo. `render.yaml` sets
  everything; Render asks for `LLM_API_KEY` (Gemini). The build seeds the demo data. Free
  instances sleep after 15 min idle (~1 min to wake) and reset to the seeded data on restart.
- **Frontend → Vercel:** root directory `frontend`, env `BACKEND_URL` = the Render service URL
  (read at build time, so redeploy after changing it). `/api` is proxied, so the session
  cookie stays first-party. `FRONTEND_ORIGIN` on Render must equal the Vercel URL.
- **While the backend sleeps or restarts**, pages show a "Waking up the server" card
  (`frontend/lib/backend-status.ts`, `components/server-waking.tsx`) that polls `/api/health`
  and carries on by itself when it answers, instead of rendering blank.
- **Memory (512 MB on the free plan):** the embedding model (~140 MB) loads once, on the first
  search or dashboard, behind a lock so parallel requests share it; `start.sh` caps allocator
  arenas and thread pools. Expect ~90 MB idle and ~250 MB after the first dashboard.

## Environment variables

See `.env.example` for the full list. Copy it to `backend/.env` (backend vars) and
`frontend/.env.local` (frontend vars) — `make setup` does this automatically if those files
don't already exist.
