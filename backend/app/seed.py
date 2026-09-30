"""Resets and loads all demo data (Section 9). Run with:

    python -m app.seed

Creates demo users (password `demo1234`), runs every entry in
seed/opportunities.json through the real extraction/embedding/dedup pipeline
(ingest_page_text), and sets up a shared demo Application File with tracker
cards, a draft document, and activity history.
"""
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import Base, SessionLocal, engine  # noqa: E402
import app.models_registry  # noqa: E402,F401
from app.models.document import Document  # noqa: E402
from app.models.opportunity import Opportunity, OpportunitySource, SavedOpportunity  # noqa: E402
from app.models.profile import Profile  # noqa: E402
from app.models.source import Source  # noqa: E402
from app.models.tracker import ActivityLog, TrackerItem  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_state import UserState  # noqa: E402
from app.models.workspace import Workspace, WorkspaceMember  # noqa: E402
from app.services.activity import log_activity  # noqa: E402
from app.services.scrape_pipeline import ingest_page_text  # noqa: E402
from app.services.security import hash_password  # noqa: E402

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"
DEMO_PASSWORD = "demo1234"

# Seed page text may say "Deadline: {{today+5}}" so the demo always has
# near-deadline and just-expired items no matter when it's seeded.
RELATIVE_DATE = re.compile(r"\{\{today([+-]\d+)\}\}")


def render_relative_dates(text: str, today: date | None = None) -> str:
    today = today or date.today()

    def _sub(m):
        d = today + timedelta(days=int(m.group(1)))
        return d.strftime("%B ") + str(d.day) + d.strftime(", %Y")

    return RELATIVE_DATE.sub(_sub, text)


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def create_demo_users(db):
    student = User(email="student@demo.com", name="Sara Student", role="student", password_hash=hash_password(DEMO_PASSWORD))
    teammate = User(email="teammate@demo.com", name="Tariq Teammate", role="student", password_hash=hash_password(DEMO_PASSWORD))
    faculty = User(email="faculty@demo.com", name="Dr. Fatima Faculty", role="faculty", password_hash=hash_password(DEMO_PASSWORD))
    admin = User(email="admin@demo.com", name="Aisha Admin", role="admin", password_hash=hash_password(DEMO_PASSWORD))
    db.add_all([student, teammate, faculty, admin])
    db.flush()

    db.add(Profile(
        user_id=student.id, degree_level="bachelors", year_of_study=3, major="Computer Science",
        cgpa=7.5, cgpa_scale=10, nationality="Indian", country_of_residence="UAE",
        english_tests={"IELTS": 7.0}, skills=["Python", "PyTorch", "React"],
        interests=["machine learning", "robotics", "public policy"], onboarding_step=3, onboarding_complete=True,
    ))
    db.add(Profile(user_id=teammate.id, degree_level="bachelors", year_of_study=3, major="Computer Science", onboarding_complete=True))
    db.add(Profile(user_id=faculty.id))
    db.add(Profile(user_id=admin.id))
    for u in (student, teammate, faculty, admin):
        db.add(UserState(user_id=u.id, last_route="/dashboard"))
    db.commit()
    return student, teammate, faculty, admin


def load_opportunities(db):
    path = SEED_DIR / "opportunities.json"
    entries = json.loads(path.read_text())

    sources_by_name = {}
    inserted = merged = updated = 0
    for entry in entries:
        source = sources_by_name.get(entry["source_name"])
        if not source:
            source = Source(name=entry["source_name"], base_url=entry["source_url"], region=entry["region"])
            db.add(source)
            db.flush()
            sources_by_name[entry["source_name"]] = source

        result = ingest_page_text(db, source, entry["source_url"], render_relative_dates(entry["raw_text"]))
        action = result.get("action")
        if action == "inserted":
            inserted += 1
        elif action == "merged":
            merged += 1
        elif action == "updated":
            updated += 1

    print(f"Opportunities: {inserted} inserted, {merged} merged as duplicates, {updated} updated, "
          f"from {len(entries)} source pages across {len(sources_by_name)} sources.")


def create_demo_workspace(db, student, teammate):
    ws = Workspace(name="Summer 2027 Research Internships", description="Tracking AI/ML internships and fellowships for next summer.", owner_id=student.id)
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=student.id, role="owner"))
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=teammate.id, role="editor"))

    sop = Document(
        workspace_id=ws.id, type="sop", title="Statement of Purpose - MBZUAI",
        content="# Statement of Purpose\n\nI am a third-year Computer Science student with a strong interest "
                "in machine learning and robotics...\n\n*Draft in progress.*",
        updated_by=student.id, version=1,
    )
    checklist = Document(
        workspace_id=ws.id, type="checklist", title="Application Checklist",
        content="- [x] CV\n- [ ] Statement of Purpose\n- [ ] Transcripts\n- [ ] Two recommendation letters\n"
                "- [ ] English test scores",
        updated_by=teammate.id, version=1,
    )
    db.add_all([sop, checklist])
    db.flush()

    ai_ml_opps = (
        db.query(Opportunity)
        .filter(Opportunity.canonical_id.is_(None), Opportunity.status == "active")
        .filter(Opportunity.fields.isnot(None))
        .all()
    )
    ai_ml_opps = [o for o in ai_ml_opps if "AI/ML" in (o.fields or []) or "Computer Science" in (o.fields or [])][:3]

    statuses = ["preparing", "saved", "submitted"]
    for i, opp in enumerate(ai_ml_opps):
        db.add(TrackerItem(
            workspace_id=ws.id, opportunity_id=opp.id, status=statuses[i % len(statuses)],
            assignee_id=student.id if i % 2 == 0 else teammate.id, position=i,
        ))
        db.add(SavedOpportunity(user_id=student.id, opportunity_id=opp.id))

    log_activity(db, ws.id, student.id, "workspace_created", {"name": ws.name, "template": "single_application"})
    log_activity(db, ws.id, student.id, "document_created", {"title": sop.title, "type": "sop"})
    log_activity(db, ws.id, teammate.id, "invite_accepted", {"role": "editor"})
    log_activity(db, ws.id, teammate.id, "document_created", {"title": checklist.title, "type": "checklist"})
    log_activity(db, ws.id, teammate.id, "document_edited", {"document_id": checklist.id, "title": checklist.title})
    db.commit()
    print(f"Demo workspace '{ws.name}' created with {len(ai_ml_opps)} tracker cards.")
    return ai_ml_opps


def simulate_deadline_extension(db, opp):
    """Re-ingest a saved opportunity's page with a later deadline, through the real
    change-detection path, so its change-history timeline isn't empty in the demo."""
    link = db.query(OpportunitySource).filter(OpportunitySource.opportunity_id == opp.id).first()
    source = db.get(Source, link.source_id)
    entries = json.loads((SEED_DIR / "opportunities.json").read_text())
    entry = next(e for e in entries if e["source_url"] == link.url)
    original = render_relative_dates(entry["raw_text"])
    old_deadline = opp.deadline
    new_deadline = old_deadline + timedelta(days=14)
    fmt = lambda d: d.strftime("%B ") + str(d.day) + d.strftime(", %Y")  # noqa: E731
    updated = original.replace(fmt(old_deadline), fmt(new_deadline))
    result = ingest_page_text(db, source, link.url, updated)
    print(f"Simulated re-scrape of '{opp.title}': changed {', '.join(result.get('changed_fields', [])) or 'nothing'}.")


def main():
    print("Resetting database...")
    reset_db()
    db = SessionLocal()
    try:
        print("Creating demo users (password: demo1234)...")
        student, teammate, faculty, admin = create_demo_users(db)
        print("Loading seed opportunities through the extraction pipeline (this embeds every entry, ~1-2 min)...")
        load_opportunities(db)
        print("Setting up the shared demo Application File...")
        tracked = create_demo_workspace(db, student, teammate)
        if tracked:
            simulate_deadline_extension(db, tracked[0])
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
