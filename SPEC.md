# ScholarRadar — Build Specification

You are building a complete, demo-ready hackathon project for **CampusOPS (IEEE BPDC), Problem Statement 03: Research Opportunity Aggregation & Discovery Platform**.

Core idea: most aggregators stop at a list of links. ScholarRadar takes a student **from discovery to a submitted application**: it tells them what exists, what they are actually eligible for, who to contact, and what to send, and lets them work on applications together with teammates.

Read this whole file before writing code. Enter plan mode first, propose the plan, then build phase by phase (see "Build Phases"). Do not stop to ask for permission between phases unless you are genuinely blocked.

---

## 1. Tech Stack

- **Frontend:** Next.js 14 (App Router, TypeScript), Tailwind CSS, shadcn/ui, TanStack Query, dnd-kit (Kanban), Recharts (analytics).
- **Backend:** FastAPI (Python 3.11), SQLAlchemy 2 + Alembic, Pydantic v2.
- **Database:** PostgreSQL 16 with the `pgvector` extension.
- **Auth:** email + password (argon2 hashing), JWT in an httpOnly, SameSite=Lax cookie; roles `student`, `faculty`, `admin`.
- **Scraping:** httpx + BeautifulSoup; Playwright only as a fallback for JavaScript-rendered pages; `robots.txt` respected via `urllib.robotparser`.
- **Scheduling:** APScheduler inside the backend (re-scrape every 6 hours, expiry check daily, digest weekly).
- **AI:** Anthropic Python SDK. Model names come from env vars:
  - `EXTRACTION_MODEL` (default `claude-haiku-4-5-20251001`) for bulk extraction, query parsing and classification.
  - `WRITING_MODEL` (default `claude-sonnet-5-5`) for SOP/email drafting.
- **Embeddings:** `sentence-transformers/all-MiniLM-L6-v2` (384 dims, runs locally, free).
- **External APIs:** Semantic Scholar Graph API (public) for the professor finder.
- **Notifications:** in-app notifications always; email via SMTP if configured; Telegram bot (python-telegram-bot) if `TELEGRAM_BOT_TOKEN` is set.
- **Calendar:** `ics` Python library for .ics export.
- **Infra:** Docker Compose (db, backend, frontend). One command to run: `docker compose up`.

All secrets live in `.env` (provide `.env.example`). Never hard-code keys. The app must still run with **no API keys** using demo mode (Section 9).

---

## 2. Repository Structure

```
scholarradar/
  docker-compose.yml
  .env.example
  README.md
  DEMO_SCRIPT.md
  backend/
    app/
      main.py
      config.py
      db.py
      models/          # SQLAlchemy models
      schemas/         # Pydantic schemas
      routers/         # auth, users, workspaces, documents, opportunities, profile,
                       # search, professors, copilot, tracker, notifications,
                       # faculty, admin, public_api
      services/        # scraper, extractor, dedupe, change_detector, eligibility,
                       # matcher, embeddings, semantic_scholar, copilot, digest,
                       # telegram_bot, ics_export
      jobs/            # scheduler setup
      prompts/         # all LLM prompts as .txt/.md files
    alembic/
    seed/              # seed JSON + seed script
    tests/
  frontend/
    app/               # routes (see Section 6)
    components/
    lib/
    public/widget.js   # embeddable widget
```

---

## 3. Data Model

Use UUID primary keys and `created_at`/`updated_at` timestamps everywhere.

- **users**: email (unique), password_hash, name, role (`student|faculty|admin`), telegram_chat_id (nullable).
- **profiles** (1:1 with users): degree_level (`bachelors|masters|phd`), year_of_study, major, cgpa, cgpa_scale (default 10), nationality, country_of_residence, english_tests (JSON, e.g. `{"IELTS": 7.0}`), skills (text[]), interests (text[]), cv_text, cv_filename, embedding (vector 384).
- **user_state** (1:1): last_route, last_workspace_id, last_document_id, ui_state (JSON: filters, open tabs, scroll positions, search query), updated_at.
- **workspaces** ("Application Files"): name, description, emoji/icon, owner_id, archived.
- **workspace_members**: workspace_id, user_id, role (`owner|editor|viewer`), joined_at.
- **invites**: workspace_id, email, role, token (random, unique), expires_at, accepted_at, invited_by.
- **documents**: workspace_id, type (`sop|cold_email|checklist|notes|cover_letter`), title, content (markdown), opportunity_id (nullable), version (int), updated_by.
- **document_versions**: document_id, version, content, edited_by, created_at.
- **tracker_items**: workspace_id, opportunity_id, status (`saved|preparing|submitted|accepted|rejected`), assignee_id, notes, position.
- **activity_log**: workspace_id, user_id, action, meta (JSON), created_at.
- **sources**: name, base_url, region (`uae|gcc|global|india|europe|usa|asia`), active, last_checked, last_status, notes.
- **raw_pages**: source_id, url, content_hash, text_content, fetched_at, http_status.
- **opportunities**: canonical_id (self-reference for merged duplicates), title, organization, url, type (`research_internship|fellowship|grant|scholarship|research_position|summer_school`), degree_levels (text[]), fields (text[]), funding_type (`fully_funded|partial|stipend|unfunded|unknown`), funding_amount (text), location, is_remote, open_to_uae_residents (bool|null), deadline (date|null), deadline_text, eligibility (JSON, schema in Section 5.1), description_summary, confidence (JSON per field, 0–1), overall_confidence, verified (bool), verified_by, status (`active|expired|broken|pending_review`), embedding (vector 384), first_seen, last_checked.
- **opportunity_sources**: opportunity_id, source_id, url (for "found on N sources").
- **opportunity_changes**: opportunity_id, field, old_value, new_value, detected_at.
- **saved_opportunities**: user_id, opportunity_id.
- **endorsements**: opportunity_id, faculty_id, note, target_degree_level, target_year, target_major.
- **notifications**: user_id, type, title, body, link, read, created_at.
- **outcomes**: user_id, opportunity_id, result (`accepted|rejected|waitlisted`), reported_at, share_anonymously (bool).

---

## 4. Accounts, Saved Progress, Application Files & Teammates

### 4.1 Login & Registration
- Pages: `/login`, `/register`, `/forgot-password` (token shown in dev mode / sent via SMTP if configured).
- Register: name, email, password (min 8 chars), role selector limited to `student` (faculty/admin accounts are created by seed or by an admin).
- Rate-limit login attempts (5 per minute per IP).
- `/settings`: change password, connect Telegram, notification preferences, **download my data** (JSON export), **delete my account** (removes profile, CV text, and personal data).

### 4.2 Saved Progress ("Continue where you left off")
- Every page change updates `user_state.last_route` (debounced, 1 request per 3 s max).
- Filters, search query, and open workspace/document are saved in `user_state.ui_state`.
- Documents **autosave** 1.5 s after the user stops typing; show a status indicator ("Saving…", "Saved 2s ago", "Offline — changes kept locally"). Keep unsent edits in memory and retry on reconnect.
- After login, the dashboard shows a **"Continue where you left off"** card: last workspace, last document (with a preview of the last edited lines), and restored search filters. One click resumes exactly there.
- Profile setup is a multi-step wizard that saves each step, so leaving halfway and returning resumes at the same step.

### 4.3 Application Files (create new file)
- An **Application File** is a workspace for one application or a group of related applications (e.g. "Summer 2027 AI Internships").
- `/files` lists all files the user owns or is a member of, with name, icon, member avatars, number of opportunities, nearest deadline, and last activity.
- **"+ New File"** button opens a dialog: name, description, icon, and an optional template:
  - *Blank*
  - *Single application* (auto-creates SOP, cold email, and checklist documents)
  - *Scholarship hunt* (auto-creates a tracker and notes document)
- Inside a file (`/files/[id]`), tabs: **Overview**, **Tracker** (Kanban), **Documents**, **Team**, **Activity**.
- **"+ New Document"** inside a file: choose type (SOP, cold email, cover letter, checklist, notes), optionally link to an opportunity, and optionally "Generate first draft with AI" (Feature 4).
- Documents have version history with restore.
- Files can be renamed, duplicated, archived, and deleted (owner only).

### 4.4 Teammates (create new teammate)
- **Team** tab inside a file: list members with role; **"+ Add Teammate"** dialog with email and role (`editor` or `viewer`).
- If the email belongs to an existing user, they get an in-app notification and the file appears in their list after accepting.
- If not, create an invite with a unique link (`/invite/[token]`, expires in 7 days). Show the link in the UI with a copy button (so the demo works without email), and also email it if SMTP is configured.
- Owners can change roles and remove members. Viewers cannot edit documents or the tracker.
- Tracker cards can be **assigned** to a teammate; the assignee is notified.
- Every change (document edit, card move, member added) is written to `activity_log` and shown in the Activity tab.
- Documents show "Last edited by X, 2 min ago". If two people edit the same document, use optimistic concurrency on `version`: if the version changed, show "A teammate updated this document" with options to view their version or overwrite. (No real-time co-editing needed.)
- Poll the Activity feed and open documents every 10 s for updates.

---

## 5. Features

### Tier 1 — Signature Features

**Feature 1: CV-based Eligibility Checker**
- In the profile wizard, the student uploads a CV/transcript (PDF or DOCX, max 5 MB). Extract text (pypdf / python-docx), then use `EXTRACTION_MODEL` to fill the profile fields as JSON. The student reviews and corrects them before saving.
- During scraping, eligibility is extracted into this JSON schema:
  ```json
  {
    "degree_levels": ["bachelors"],
    "min_year": 2, "max_year": null,
    "min_cgpa": {"value": 3.0, "scale": 4},
    "nationality_allowed": ["any"], "nationality_excluded": [],
    "residency_required": null,
    "english_requirements": {"IELTS": 6.5, "TOEFL": 90},
    "required_fields": ["computer science", "engineering"],
    "other_requirements": ["recommendation letter from supervisor"]
  }
  ```
- Matching is deterministic code in `services/eligibility.py` (convert CGPA scales, compare years, nationality, tests). Use the LLM only to map fuzzy fields (e.g. whether "AI" matches "computer science").
- Output per opportunity: `eligible`, `partially_eligible` (with a list of missing items such as "IELTS 6.5 required, you have none"), or `not_eligible` (with reason), or `unknown` (data missing). Show as coloured badges with an expandable explanation.
- Unit tests for the eligibility logic are required.

**Feature 2: Explainable Match Score**
- Score 0–100 = 45% semantic similarity (profile embedding vs. opportunity embedding) + 25% eligibility + 15% field overlap + 10% deadline feasibility (enough time left) + 5% funding preference.
- Every card shows the score and the top 3 reasons in plain language ("Matches your ML interest", "Your year qualifies", "Deadline in 21 days").
- Dashboard section "Top matches for you".

**Feature 3: Professor & Lab Finder**
- For an opportunity or a free-text research interest, query the Semantic Scholar API for relevant recent papers, group them by author, and rank authors by relevance, recency, and citation count.
- Show name, affiliation, research topics, 3 recent papers with links, and a "Draft cold email" button (Feature 4).
- Highlight authors affiliated with BITS Pilani or UAE institutions.
- Cache responses in Postgres for 7 days; handle rate limits with backoff.

**Feature 4: Application Copilot**
- For an opportunity (+ the student's profile), generate:
  - a document checklist (CV, SOP, transcripts, letters of recommendation, test scores, portfolio), each with a checkbox saved in a `checklist` document;
  - a first-draft SOP tailored to the opportunity and the profile;
  - a cold email to a matched professor (under 150 words, specific reference to one of their papers).
- Uses `WRITING_MODEL`. Drafts are saved into the current Application File as documents, clearly labelled **"AI draft — edit before sending"**.
- The prompt must forbid inventing achievements not present in the profile or CV.

### Tier 2 — Trust & Freshness

**Feature 5: Change Detection & Alerts**
- On each re-scrape, compare `content_hash`. If changed, re-extract and diff key fields (deadline, eligibility, funding, status). Record in `opportunity_changes`.
- Notify every user who saved the opportunity or has it in a tracker: e.g. "Deadline extended: 1 Nov → 15 Nov".
- Opportunity page shows a "Change history" timeline.

**Feature 6: Confidence & Verification**
- The extractor returns a confidence score per field. If `overall_confidence < 0.7` or the deadline is missing, set status `pending_review`.
- Faculty/admin **Review Queue** (`/faculty/review`): side-by-side view of the source page text and extracted fields, edit, then approve → `verified = true`, badge "Verified by BPDC faculty".
- Every card shows "Last checked X ago". Links returning 404/410 twice in a row → status `broken`, hidden from students, listed for admins.
- Deadline passed → status `expired` automatically (daily job); expired items are hidden by default with a toggle to show them.

**Feature 7: Cross-source Deduplication**
- After extraction, find candidates with cosine similarity > 0.9 on title+organization embeddings AND same deadline (± 3 days) or same organization. Merge into one canonical opportunity and link all sources in `opportunity_sources`.
- Card shows "Found on N sources".

### Tier 3 — Student Experience

**Feature 8: Natural-language Search**
- Search bar accepts queries like "funded summer AI internships in Europe for 3rd year undergrads".
- `EXTRACTION_MODEL` converts the query to structured filters (degree level, field, funding, region, type, deadline range) plus a semantic query string. Combine SQL filters with pgvector similarity ranking.
- Show the interpreted filters as removable chips so the user can see and correct what was understood.
- Standard filter sidebar is also available.

**Feature 9: Tracker Board & Calendar**
- Kanban with columns Saved → Preparing → Submitted → Accepted / Rejected (dnd-kit, positions persisted).
- Cards show deadline countdown (red under 7 days), assignee avatar, and eligibility badge.
- "Export to calendar" per opportunity and for the whole file (.ics download with a reminder 7 days and 1 day before each deadline).
- Moving a card to Accepted/Rejected asks the user to record an outcome (Feature 13).

**Feature 10: Personalized Digest & Telegram Bot**
- Weekly digest (in-app, plus email/Telegram if configured): new matches above 70, deadlines in the next 7 days, changes to saved opportunities.
- Telegram bot commands: `/start` (link account via one-time code shown in Settings), `/matches`, `/deadlines`, `/digest`.
- "Send digest now" button on the admin page for the live demo.

**Feature 11: UAE/GCC Focus**
- Sources have a `region`. Seed regional sources first (e.g. MBZUAI, Khalifa University, NYUAD, KAUST, UAE government / ADEK scholarships), then global ones (e.g. DAAD, Fulbright, Mitacs Globalink, research internships at major tech labs).
- Extract `open_to_uae_residents`. Add a filter "Open to UAE residents" and a dashboard section "Near you: UAE & GCC".
- Verify each seed source is public and allowed by robots.txt before including it; if a site blocks scraping, keep it only as a manually curated entry in the seed data.

### Tier 4 — Institutional

**Feature 12: Faculty Endorsements**
- Faculty can endorse an opportunity with a note and a target audience (degree level, year, major).
- Matching students get a notification and the card shows "Recommended by Dr. X" with the note. Endorsed items get a ranking boost.

**Feature 13: Admin Analytics Dashboard** (`/admin`)
- Charts: opportunities by type, field, funding, and region; new opportunities per week; saves/applications per week; top fields students are interested in; outcomes (accepted/rejected) per term.
- Headline stats: sources monitored, active opportunities, verified %, average extraction confidence, students with at least one application.
- "Success stories": outcomes marked `share_anonymously`, e.g. "3 BPDC students were accepted to DAAD RISE this year".
- CSV export of the report.
- Source management: add/disable sources, trigger a re-scrape, see last status.

**Feature 14: Portal Integration**
- Public read-only REST API: `GET /api/public/opportunities` (filters: degree, field, type, region, limit), `GET /api/public/opportunities/{id}`. Only active, non-broken items. CORS enabled.
- RSS feed at `/feed.xml` (optionally filtered by query params).
- Embeddable widget: `<script src=".../widget.js" data-degree="bachelors" data-field="computer science"></script>` renders a compact, styled list that links back to ScholarRadar. Must not break the host page styles (use Shadow DOM).
- A mock page `/demo/portal` that imitates a university portal and embeds the widget, for the live demo.

---

## 6. Frontend Routes

| Route | Purpose |
|---|---|
| `/login`, `/register`, `/forgot-password`, `/invite/[token]` | Auth and invites |
| `/onboarding` | Profile wizard with CV upload (resumable) |
| `/dashboard` | Continue card, top matches, near-you, deadlines this week, endorsed, notifications |
| `/discover` | NL search + filters + results |
| `/opportunities/[id]` | Details, eligibility breakdown, match reasons, change history, sources, professors, "Add to file", "Generate application kit" |
| `/professors` | Professor & lab finder |
| `/files`, `/files/[id]` | Application Files with Overview/Tracker/Documents/Team/Activity tabs |
| `/files/[id]/docs/[docId]` | Markdown editor with autosave + version history |
| `/settings` | Account, Telegram, notifications, data export, delete account |
| `/faculty/review`, `/faculty/endorse` | Faculty tools |
| `/admin` | Analytics, sources, digest trigger |
| `/demo/portal` | Mock university portal with widget |

Design: clean and modern, light and dark mode, responsive down to mobile width, accessible (labels, keyboard navigation, contrast). Use skeleton loaders and empty states with helpful calls to action. Show a toast on every save/error.

---

## 7. Scraping Rules (must follow)

- Only public pages. Check `robots.txt` before fetching; skip disallowed URLs.
- Identify with a clear User-Agent including a contact email from `.env`.
- Max 1 request per 2 seconds per domain; timeouts of 15 s; retries with exponential backoff.
- Store the raw text and hash; never re-process unchanged pages.
- Extraction prompt returns strict JSON (validate with Pydantic; on failure retry once, then mark `pending_review`).
- Log every run (source, pages fetched, new, updated, failed) and show it on the admin page.

---

## 8. Security & Privacy

- Authorization checks on every endpoint (workspace membership and role, faculty/admin routes).
- CV files: store extracted text only by default; delete the original file after parsing. Never send CV content anywhere except the configured LLM API.
- Input validation on all endpoints; parameterized queries only; escape rendered markdown (sanitize HTML).
- Invite tokens are single-use and expire.
- No personal data in the public API, RSS feed, or widget.

---

## 9. Seed Data & Demo Mode

- `backend/seed/opportunities.json` with **50+ realistic opportunities** across all types, degree levels, regions (at least 15 UAE/GCC), with some near deadlines, some expired, some with low confidence (for the review queue), and a few duplicate pairs (to show merging). Mark clearly in the README that seed entries must be verified against the real source before any real use.
- Demo users (password `demo1234`): `student@demo.com` (profile filled, 3rd-year CS, CGPA 7.5/10), `teammate@demo.com`, `faculty@demo.com`, `admin@demo.com`.
- Demo Application File "Summer 2027 Research Internships" shared between the student and teammate, with tracker cards, an SOP draft, a checklist, and activity history.
- If `ANTHROPIC_API_KEY` is missing, set `DEMO_MODE=true`: use cached extraction/draft outputs from `seed/cache/` and show a small "Demo mode" banner.
- `make seed` (or `python -m app.seed`) resets and loads everything.

---

## 10. Build Phases

After each phase: run the app, run tests, fix errors, update README, `git commit` with a clear message, then continue to the next phase.

0. **Scaffold:** repo structure, Docker Compose, Postgres + pgvector, Alembic, health check, frontend shell with navigation and dark mode.
1. **Accounts & progress:** register/login/logout, roles, `user_state`, "Continue where you left off", resumable onboarding wizard, settings (export/delete).
2. **Application Files & teammates:** files CRUD, templates, documents with autosave and versions, invites, roles, assignment, activity log.
3. **Scraping pipeline:** sources, scraper with robots.txt and rate limits, LLM extraction, embeddings, dedupe (F7), expiry, broken-link detection, change detection (F5), scheduler, seed data.
4. **Matching:** CV upload and profile extraction, eligibility checker (F1) with unit tests, match score (F2), NL search (F8), discover page, opportunity page.
5. **Action features:** professor finder (F3), application copilot (F4), tracker Kanban + .ics (F9).
6. **Engagement & trust:** notifications, digest + Telegram (F10), UAE/GCC section (F11), confidence and review queue (F6), faculty endorsements (F12).
7. **Institutional & integration:** admin analytics (F13), public API, RSS, widget, mock portal (F14).
8. **Polish:** replace `/` (a dev status page until then) with a real homepage: a short headline explaining the product, "how it works" in … *(rest of this requirement still to be supplied)*; demo mode, empty states, loading states, mobile check, accessibility pass, `README.md` (setup in under 5 commands), `DEMO_SCRIPT.md` (a 3-minute demo flow: login → continue card → upload CV → eligibility verdicts → NL search → professor finder → generate kit into a shared file → teammate sees it → change alert → admin analytics → widget on mock portal).

---

## 11. Definition of Done

- `docker compose up` then `make seed` gives a fully working app with no manual steps.
- Every feature above is reachable from the UI and works in demo mode without API keys.
- Backend tests pass (at minimum: auth, workspace permissions, invites, eligibility logic, dedupe, change detection).
- No console errors in the browser on main pages; no unhandled exceptions in backend logs during the demo script.

---

> **Build note (this repo):** the actual build adapts the infra layer (SQLite instead of
> Postgres+pgvector, a `Makefile` instead of Docker Compose, a locally-extracted Node.js
> instead of a system install) to run without Docker/Homebrew/sudo access in the build
> environment. Every data model, feature, and route above is still built as specified. See
> `README.md` → "Infra notes" for the full rationale and the adaptation table.
