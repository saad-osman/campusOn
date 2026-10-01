# ScholarRadar

From discovery to a submitted application: ScholarRadar tells students what research
opportunities exist, what they're actually eligible for, who to contact, and what to send —
and lets them work on applications together with teammates.

Built for CampusOPS (IEEE BPDC), Problem Statement 03: Research Opportunity Aggregation &
Discovery Platform.

## Status

Build follows the phased plan in `SPEC.md` (Section 10). Current progress:

- [x] Phase 0 — Scaffold
- [x] Phase 1 — Accounts & progress
- [x] Phase 2 — Application Files & teammates
- [x] Phase 3 — Scraping pipeline
- [x] Phase 4 — Matching
- [ ] Phase 5 — Action features
- [ ] Phase 6 — Engagement & trust
- [ ] Phase 7 — Institutional & integration
- [ ] Phase 8 — Polish

## Infra notes (read this first)

This build environment has no Docker, no Node.js, no PostgreSQL, and no Homebrew available
(no sudo/GUI access to install them). Rather than block on manual installs, the infra layer
was adapted to equivalents that need no system-level install, while every feature, route, and
data model from the spec is built as specified:

| Spec | This build | Why |
|---|---|---|
| PostgreSQL 16 + pgvector | SQLite + embeddings as JSON, cosine similarity in Python (numpy) | No Postgres/Docker available. At this data scale (dozens–low hundreds of rows) a Python cosine scan is plenty fast, and it keeps the whole stack to one file with no server process to run. |
| `docker compose up` | `make dev` (Makefile starts uvicorn + `next dev` together) | No Docker on this machine. |
| Node via system package manager | Official Node.js tarball extracted into `.node/` (gitignored, not committed) | No Homebrew. Run `make setup` and it's handled for you. |
| Demo mode uses cached extraction outputs from `seed/cache/` | Demo mode uses a deterministic rule-based extractor | It runs the same pipeline on any page, not just pre-cached ones, and reports lower confidence so weak extractions still reach the review queue. `seed/cache/` is still planned for cached SOP and email drafts (Phase 5). |
| Playwright fallback for JS-rendered pages | Stubbed hook in `services/scraper.py`; flags `pending_review` instead | Avoids an uninvited ~300MB browser-binary download; wire up on request. |
| `docker-compose.yml` / Dockerfiles | Present under `docker/` (added in Phase 8) but **unverified** — there was no Docker in this environment to test them against | Keeps the repo structure honest without claiming untested things work. |

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
- **Extraction** (`services/extractor.py`): with `ANTHROPIC_API_KEY` set, Claude
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

## Tech stack

- **Frontend:** Next.js 14 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui, TanStack
  Query, dnd-kit, Recharts.
- **Backend:** FastAPI (Python 3.10+), SQLAlchemy 2 + Alembic (batch mode, SQLite-compatible),
  Pydantic v2.
- **Database:** SQLite (see Infra notes above).
- **Auth:** email + password (argon2), JWT in an httpOnly `SameSite=Lax` cookie; roles
  `student`, `faculty`, `admin`.
- **AI:** Anthropic Python SDK. `EXTRACTION_MODEL` (default `claude-haiku-4-5-20251001`) for
  extraction/parsing/classification, `WRITING_MODEL` (default `claude-sonnet-5`) for
  SOP/email drafting. Runs in demo mode (cached outputs, no external calls) when
  `ANTHROPIC_API_KEY` is unset.

## Setup

```bash
make setup     # backend venv + deps, frontend npm install, .env files
make migrate   # create the SQLite schema
make seed      # load demo users + seed opportunities
make dev       # backend on :8000, frontend on :3000
```

Then open http://localhost:3000.

Run the backend test suite with `make test`.

## Repository layout

```
scholarradar/
  Makefile
  .env.example
  README.md
  DEMO_SCRIPT.md
  backend/
    app/            # main, config, db, models/, schemas/, routers/, services/, jobs/, prompts/
    alembic/
    seed/
    tests/
  frontend/         # Next.js App Router app
  docker/           # best-effort, unverified Dockerfiles + compose (Phase 8)
```

## Environment variables

See `.env.example` for the full list. Copy it to `backend/.env` (backend vars) and
`frontend/.env.local` (frontend vars) — `make setup` does this automatically if those files
don't already exist.
