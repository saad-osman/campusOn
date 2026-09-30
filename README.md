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
- [ ] Phase 2 — Application Files & teammates
- [ ] Phase 3 — Scraping pipeline
- [ ] Phase 4 — Matching
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
