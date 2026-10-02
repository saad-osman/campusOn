# Demo Script (3 minutes)

Setup once: `make setup && make migrate && make seed && make dev` (Windows:
`scripts\setup.ps1` then `scripts\dev.ps1`). Reseed before each run so dates are fresh:
`make seed`. Use two browser windows (one private) so you can be the student and the
teammate at the same time. Password for every account: `demo1234`.

The app runs in **demo mode** without an API key (rule-based extraction and template drafts).
Everything below works offline except the professor finder, which falls back to a labelled
sample when Semantic Scholar is unreachable.

| Time | Step | Do | Say / point at |
|---|---|---|---|
| 0:00 | **Login** | Log in as `student@demo.com`. | "Every student lands on a personal dashboard." |
| 0:10 | **Continue card** | Dashboard: point at *Continue where you left off*. Click the SOP. | It remembers the last file, the document (with a preview of the last lines) and the last search. One click resumes. |
| 0:25 | **Upload CV** | Avatar menu → *Edit profile*. Step 1: drop `frontend/public/sample-cv.docx` (or use *Download a sample CV*). | Degree, year, CGPA 8.1/10, IELTS, skills and interests extracted. "Nothing is saved until the student reviews it." Click *Continue* through the steps. |
| 0:50 | **Eligibility verdicts** | Go to **Discover**. Expand a red *Not eligible* badge (e.g. ETH Zurich SSRF). | "CGPA 3.5/4 required; you have 7.5/10 (≈3.00/4)": a deterministic check with scale conversion. Green, amber and grey badges explain themselves the same way. |
| 1:05 | **Natural-language search** | Type `funded summer AI internships in Europe for 3rd year undergrads`, press Enter. Remove the *Europe* chip. | The query became seven removable chips. Results are ranked by match score with three plain-language reasons each. Removing *Europe* widens to the UAE. |
| 1:25 | **Professor finder** | Open **DAAD RISE Germany**. Scroll to *Researchers to contact*. | Ranked by relevance, recency and citations; BITS and UAE affiliations highlighted. |
| 1:40 | **Generate kit into a shared file** | Click *Generate application kit*. *Save into* → **Summer 2027 Research Internships**. Keep all three parts. *Generate*. | A checklist, an SOP draft and a cold email under 150 words citing one of the professor's papers, each labelled "AI draft — edit before sending". Only real profile facts; `[brackets]` where the student must add a story. |
| 2:00 | **Teammate sees it** | Other window: log in as `teammate@demo.com` → **Files** → *Summer 2027 Research Internships* → *Activity*, then *Tracker*. | The new drafts and the activity entries are there; DAAD RISE is in *Preparing*. Drag a card to *Submitted*; assign it via the avatar. |
| 2:20 | **Change alert** | Third window or log out: `admin@demo.com` → **Admin** → *Simulate a deadline change*. Back in the student window, open the bell. | "Deadline extended: … → …" reached everyone following it. The opportunity page's *Change history* shows it too. (In production this comes from the 6-hourly re-scrape.) |
| 2:35 | **Admin analytics** | Admin page: stat tiles, *Success stories*, charts. Click *Export CSV*. | Coverage, verification rate, extraction confidence, students applying, and outcomes per term. Mention *Send digest now* and the source table's *Scrape now*. |
| 2:50 | **Widget on a portal** | Open http://localhost:3000/demo/portal. | One `<script>` tag on a university portal with deliberately clashing CSS; the Shadow-DOM widget is unaffected and links back. Same data via `/api/public/opportunities` and `/feed.xml`. |

## If something goes wrong

- **Professor finder shows "fictional sample researchers":** Semantic Scholar rate-limited the
  request. Say so; it's the designed fallback. A `SEMANTIC_SCHOLAR_API_KEY` avoids it.
- **Login says "Too many login attempts":** 5 failed logins in a minute from one IP. Wait 60 s.
- **Dates look odd:** run `make seed` again; seed deadlines are relative to today.

## Faculty extras (if there's time)

Log in as `faculty@demo.com`:
- **Review** → pick a 30%-confidence item, fix the title and deadline beside the source text,
  *Approve & verify*. It now shows "Verified by BPDC faculty" to students.
- **Endorse** → pick an opportunity, target "Year 3 · Computer Science", add a note. Matching
  students are notified and see "Recommended by Dr. Fatima Al Mansouri" on the card.
