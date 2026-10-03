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
    # The schema now matches the models, so record that in Alembic's version table;
    # otherwise a later `alembic upgrade head` re-runs migrations into existing tables.
    from alembic import command
    from alembic.config import Config

    command.stamp(Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), "head")


def create_demo_users(db):
    student = User(email="student@demo.com", name="Sara Student", role="student", password_hash=hash_password(DEMO_PASSWORD))
    teammate = User(email="teammate@demo.com", name="Tariq Teammate", role="student", password_hash=hash_password(DEMO_PASSWORD))
    faculty = User(email="faculty@demo.com", name="Dr. Fatima Al Mansouri", role="faculty", password_hash=hash_password(DEMO_PASSWORD))
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

    # "Continue where you left off" (Section 4.2): the student was last editing the SOP
    # and had a search open, so the dashboard card has something real to resume.
    state = db.query(UserState).filter(UserState.user_id == student.id).one()
    state.last_route = f"/files/{ws.id}/docs/{sop.id}"
    state.last_workspace_id = ws.id
    state.last_document_id = sop.id
    state.ui_state = {"discover": {
        "q": "funded AI internships in the UAE",
        "filters": {"fields": ["AI/ML"], "funding": "funded", "regions": ["uae"], "types": ["research_internship"],
                    "semantic_query": "internships"},
        "sort": "match",
    }}

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


def seed_trust_and_endorsements(db, faculty):
    """Phase 6 demo state: a few faculty-verified listings and one endorsement
    aimed at 3rd-year CS students (which notifies the demo student)."""
    from app.models.endorsement import Endorsement
    from app.models.profile import Profile
    from app.services.matcher import profile_to_dict
    from app.services.notifications import notify
    from app.services.opportunity_view import endorsement_applies

    canonical = db.query(Opportunity).filter(Opportunity.canonical_id.is_(None), Opportunity.status == "active")
    verified = [o for o in canonical.all() if o.title.startswith(("MBZUAI", "DAAD RISE", "Khalifa", "Dubai Future"))]
    for opp in verified:
        opp.verified, opp.verified_by = True, faculty.id

    ugrip = canonical.filter(Opportunity.title.like("MBZUAI Undergraduate Research Internship%")).first()
    if ugrip:
        e = Endorsement(opportunity_id=ugrip.id, faculty_id=faculty.id,
                        note="Great first research experience for our 3rd-year CS students. Apply early, it fills fast.",
                        target_degree_level="bachelors", target_year=3, target_major="Computer Science")
        db.add(e)
        target = {"target_degree_level": "bachelors", "target_year": 3, "target_major": "Computer Science"}
        for user, profile in db.query(User, Profile).join(Profile, Profile.user_id == User.id).filter(User.role == "student"):
            if endorsement_applies(target, profile_to_dict(profile)):
                notify(db, user.id, "endorsement", f"{faculty.name} recommends “{ugrip.title}”", e.note,
                       f"/opportunities/{ugrip.id}")
    db.commit()
    print(f"Verified {len(verified)} listings; endorsement on {'UGRIP' if ugrip else 'nothing'}.")


COHORT = [
    # name, year, major, interests
    ("Aditi Rao", 4, "Computer Science", ["machine learning", "computer vision"]),
    ("Yusuf Khan", 3, "Electrical and Electronics Engineering", ["robotics", "embedded systems"]),
    ("Meera Pillai", 4, "Biotechnology", ["bioinformatics", "machine learning"]),
    ("Rohan Das", 3, "Mechanical Engineering", ["renewable energy", "robotics"]),
    ("Fatima Noor", 4, "Economics", ["public policy", "data science"]),
    ("Karthik Iyer", 2, "Computer Science", ["natural language processing", "machine learning"]),
    ("Zara Ahmed", 3, "Chemical Engineering", ["sustainability", "climate"]),
    ("Dev Malhotra", 4, "Computer Science", ["distributed systems", "cybersecurity"]),
]

# (opportunity title prefix, result, weeks ago reported, shared anonymously)
COHORT_OUTCOMES = [
    ("DAAD RISE", "accepted", 30, True), ("DAAD RISE", "accepted", 29, True), ("DAAD RISE", "accepted", 31, True),
    ("MBZUAI Undergraduate", "accepted", 20, True), ("MBZUAI Undergraduate", "accepted", 21, True),
    ("CERN Summer", "rejected", 26, False), ("CERN Summer", "accepted", 25, True),
    ("Mitacs", "waitlisted", 18, False), ("Summer@EPFL", "rejected", 40, False),
    ("KAUST Visiting", "accepted", 8, True), ("ETH Zurich", "rejected", 6, False),
    ("Chevening", "rejected", 45, False), ("IISc Summer", "accepted", 50, True),
]


def seed_history(db):
    """Phase 7 demo state for the admin analytics: listings discovered over the
    past 12 weeks, and a fictional past cohort with saves, applications and
    outcomes (some shared anonymously as success stories)."""
    import random
    from datetime import datetime

    from app.models.outcome import Outcome

    rng = random.Random(42)
    now = datetime.utcnow()
    canonical = db.query(Opportunity).filter(Opportunity.canonical_id.is_(None)).order_by(Opportunity.title).all()
    for opp in canonical:
        # Keep a few genuinely new so the weekly digest has fresh matches.
        weeks = 0 if rng.random() < 0.25 else rng.randint(1, 11)
        opp.first_seen = now - timedelta(weeks=weeks, days=rng.randint(0, 6), hours=rng.randint(0, 23))

    active = [o for o in canonical if o.status in ("active", "expired")]
    for i, (name, year, major, interests) in enumerate(COHORT):
        u = User(email=f"cohort{i + 1}@demo.com", name=name, role="student", password_hash=hash_password(DEMO_PASSWORD))
        db.add(u)
        db.flush()
        db.add(Profile(user_id=u.id, degree_level="bachelors", year_of_study=year, major=major, cgpa=round(rng.uniform(7, 9.4), 1),
                       cgpa_scale=10, nationality="Indian", country_of_residence="UAE", interests=interests,
                       onboarding_step=4, onboarding_complete=True))
        db.add(UserState(user_id=u.id, last_route="/dashboard"))
        for opp in rng.sample(active, 5):
            db.add(SavedOpportunity(user_id=u.id, opportunity_id=opp.id,
                                    created_at=now - timedelta(weeks=rng.randint(0, 11), days=rng.randint(0, 6))))
        ws = Workspace(name=f"{name.split()[0]}'s applications", owner_id=u.id, icon="🗂️")
        db.add(ws)
        db.flush()
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=u.id, role="owner"))
        for opp in rng.sample(active, 2):
            db.add(TrackerItem(workspace_id=ws.id, opportunity_id=opp.id, status="submitted"))
            db.add(ActivityLog(workspace_id=ws.id, user_id=u.id, action="tracker_moved",
                               meta={"title": opp.title, "status": "submitted"},
                               created_at=now - timedelta(weeks=rng.randint(0, 11), days=rng.randint(0, 6))))
    db.flush()

    cohort = db.query(User).filter(User.email.like("cohort%@demo.com")).order_by(User.email).all()
    for i, (prefix, result, weeks_ago, shared) in enumerate(COHORT_OUTCOMES):
        opp = next((o for o in canonical if o.title.startswith(prefix)), None)
        if opp:
            db.add(Outcome(user_id=cohort[i % len(cohort)].id, opportunity_id=opp.id, result=result,
                           share_anonymously=shared, reported_at=now - timedelta(weeks=weeks_ago)))
    db.commit()
    print(f"Seeded analytics history: {len(cohort)} past students, {len(COHORT_OUTCOMES)} outcomes.")


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
        seed_trust_and_endorsements(db, faculty)
        seed_history(db)
        from app.services.semantic_scholar import load_snapshot

        snapshot = load_snapshot(db)
        print(f"Loaded {snapshot} professor-finder searches from the real-results snapshot.")
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
