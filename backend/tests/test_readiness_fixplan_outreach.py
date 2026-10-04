"""Application readiness, the eligibility fix plan, and the professor outreach tracker."""
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

from app.models.notification import Notification
from app.models.opportunity import Opportunity
from app.models.outreach import ProfessorOutreach
from app.services.fix_plan import build_fix_plan
from app.services.rate_limit import reset_rate_limits
from app.services.readiness import compute_readiness

TODAY = date(2026, 10, 4)


def _register(client):
    reset_rate_limits()
    client.cookies.clear()
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    return client.post("/api/auth/register", json={"name": "Stu", "email": email, "password": "password123"}).json()["id"]


def _opp(db, **kw):
    base = dict(title="Vision Fellowship", organization="Lab", type="fellowship", status="active",
                degree_levels=["bachelors"], fields=["AI/ML"], eligibility={}, funding_type="stipend",
                deadline=date.today() + timedelta(days=60), description_summary="Research.")
    base.update(kw)
    opp = Opportunity(**base)
    db.add(opp)
    db.commit()
    return opp


def _doc(type_, content, title="Doc"):
    return SimpleNamespace(type=type_, title=title, content=content)


# ---------- readiness ----------

def test_readiness_weights_checklist_and_documents():
    written = "x" * 400
    docs = [
        _doc("checklist", "- [x] CV\n- [x] Transcript\n- [ ] Two recommendation letters\n- [ ] IELTS"),
        _doc("sop", written, "SOP"),
        _doc("cold_email", "> **AI draft — edit before sending.** label\n\n" + written, "Cold email"),
        _doc("notes", "ignored entirely"),
    ]
    r = compute_readiness(docs, TODAY + timedelta(days=40), today=TODAY)
    # checklist 2/4 = 0.5; documents: 1 reviewed + 0.5 AI draft of 2 = 0.75 -> 0.6*0.5 + 0.4*0.75
    assert r["score"] == 60
    assert (r["checklist_done"], r["checklist_total"], r["docs_ready"], r["docs_ai_drafts"], r["docs_total"]) == (2, 4, 1, 1, 2)
    assert r["status"] == "on_track" and r["next_step"] == "Two recommendation letters"


def test_readiness_status_bands():
    half = [_doc("checklist", "- [x] A\n- [ ] B")]
    assert compute_readiness(half, TODAY + timedelta(days=5), today=TODAY)["status"] == "at_risk"
    assert compute_readiness(half, TODAY + timedelta(days=30), today=TODAY)["status"] == "on_track"
    assert compute_readiness([_doc("checklist", "- [x] A\n- [X] B")], None, today=TODAY)["status"] == "ready"
    empty = compute_readiness([_doc("notes", "hi")], None, today=TODAY)
    assert empty["status"] == "empty" and empty["score"] == 0
    stub = compute_readiness([_doc("sop", "short", "Statement of Purpose")], None, today=TODAY)
    assert stub["score"] == 0 and stub["status"] == "empty" and stub["next_step"] == "Write the Statement of Purpose"
    late_stub = compute_readiness([_doc("sop", "short", "SOP")], TODAY + timedelta(days=3), today=TODAY)
    assert late_stub["status"] == "at_risk"  # nothing done and the deadline is close


def test_workspace_list_includes_readiness(client, db_session):
    _register(client)
    ws = client.post("/api/workspaces", json={"name": "Apps", "template": "single_application"}).json()
    assert ws["readiness"]["docs_total"] == 2 and ws["readiness"]["score"] == 0  # empty SOP + email, empty checklist
    listed = client.get("/api/workspaces").json()
    assert listed[0]["readiness"]["status"] in ("empty", "on_track")


# ---------- fix plan ----------

def _profile(**kw):
    base = {"degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science", "interests": ["machine learning"],
            "cgpa": 8.0, "cgpa_scale": 10, "english_tests": {}, "nationality": "Indian", "country_of_residence": "UAE"}
    base.update(kw)
    return base


def test_fix_plan_dates_english_steps_back_from_deadline():
    opp = SimpleNamespace(deadline=TODAY + timedelta(days=60), degree_levels=["bachelors"],
                          eligibility={"english_requirements": {"IELTS": 6.5}, "other_requirements": ["a writing sample"]})
    plan = build_fix_plan(_profile(), opp, today=TODAY)
    assert plan["verdict"] == "partially_eligible" and not plan["blocked"]
    by_key = {s["key"]: s for s in plan["steps"]}
    assert by_key["english:book"]["due"] == TODAY + timedelta(days=25)  # 35 days before the deadline
    assert by_key["english:send"]["due"] == TODAY + timedelta(days=53)
    assert by_key["other:0"]["title"] == "Prepare: A writing sample"
    assert [s["due"] for s in plan["steps"]] == sorted(s["due"] for s in plan["steps"])


def test_fix_plan_urgent_blocked_and_profile_steps():
    opp = SimpleNamespace(deadline=TODAY + timedelta(days=10), degree_levels=["masters"],
                          eligibility={"english_requirements": {"IELTS": 6.5}, "min_cgpa": {"value": 3.0, "scale": 4}})
    plan = build_fix_plan(_profile(cgpa=None), opp, today=TODAY)
    kinds = {s["key"]: s for s in plan["steps"]}
    assert plan["blocked"] and kinds["blocked:0"]["due"] is None  # bachelor's student, master's-only
    assert kinds["profile:cgpa"]["kind"] == "profile" and kinds["profile:cgpa"]["link"] == "/settings/profile"
    assert kinds["english:book"]["urgent"] and kinds["english:book"]["due"] == TODAY  # 35 days before has passed
    assert plan["steps"][-1]["kind"] == "blocked"


def test_fix_plan_api_apply_creates_file_checklist_and_tracker(client, db_session):
    _register(client)
    client.patch("/api/profile", json={"degree_level": "bachelors", "year_of_study": 3, "major": "CS", "interests": ["ml"]})
    opp = _opp(db_session, eligibility={"english_requirements": {"IELTS": 6.5}})
    plan = client.get(f"/api/opportunities/{opp.id}/fix-plan").json()
    assert [s["key"] for s in plan["steps"]][:1] == ["english:book"]

    res = client.post(f"/api/opportunities/{opp.id}/fix-plan/apply", json={}).json()
    assert res["added"] == 3
    doc = client.get(f"/api/documents/{res['document_id']}").json()
    assert doc["type"] == "checklist" and doc["content"].count("- [ ] ") == 3 and "(by " in doc["content"]
    tracker = client.get(f"/api/workspaces/{res['workspace_id']}/tracker").json()
    assert any(t["opportunity"]["id"] == opp.id for t in tracker)
    ws = client.get(f"/api/workspaces/{res['workspace_id']}").json()
    assert ws["readiness"]["checklist_total"] == 3

    again = client.post(f"/api/opportunities/{opp.id}/fix-plan/apply", json={"workspace_id": res["workspace_id"]}).json()
    assert again["added"] == 0 and again["document_id"] == res["document_id"]  # no duplicate steps


def test_fix_plan_apply_rejects_nothing_actionable(client, db_session):
    _register(client)
    client.patch("/api/profile", json={"degree_level": "bachelors", "year_of_study": 3, "major": "CS"})
    opp = _opp(db_session, degree_levels=["phd"])
    assert client.post(f"/api/opportunities/{opp.id}/fix-plan/apply", json={}).status_code == 400


# ---------- outreach ----------

def test_outreach_log_dedupe_follow_up_and_reply(client, db_session):
    _register(client)
    body = {"professor_name": "Dr. Ada", "affiliation": "KU", "author_id": "s2-1"}
    first = client.post("/api/outreach", json=body).json()
    assert first["status"] == "sent" and first["follow_up_on"] == str(date.today() + timedelta(days=7))
    assert client.post("/api/outreach", json=body).json()["id"] == first["id"]  # still waiting: same entry

    followed = client.patch(f"/api/outreach/{first['id']}", json={"followed_up": True}).json()
    assert followed["follow_ups"] == 1 and followed["follow_up_on"] == str(date.today() + timedelta(days=7))
    replied = client.patch(f"/api/outreach/{first['id']}", json={"status": "replied"}).json()
    assert replied["status"] == "replied" and replied["follow_up_on"] is None and not replied["follow_up_due"]
    assert client.post("/api/outreach", json=body).json()["id"] != first["id"]  # a new email after a reply


def test_outreach_reminder_once_per_due_date(client, db_session):
    user_id = _register(client)
    o = client.post("/api/outreach", json={"professor_name": "Dr. Lin", "sent_on": str(date.today() - timedelta(days=8))}).json()
    assert o["follow_up_due"]

    def reminders():
        db_session.expire_all()
        return db_session.query(Notification).filter(Notification.user_id == user_id, Notification.type == "outreach").count()

    client.get("/api/notifications")
    client.get("/api/outreach")
    assert reminders() == 1 and client.get("/api/outreach").json()[0]["follow_up_due"]

    # A follow-up moves the date a week out: no new reminder until then.
    client.patch(f"/api/outreach/{o['id']}", json={"followed_up": True})
    client.get("/api/notifications")
    assert reminders() == 1
    row = db_session.get(ProfessorOutreach, o["id"])
    row.follow_up_on = date.today()
    db_session.commit()
    client.get("/api/notifications")
    assert reminders() == 2


def test_outreach_is_private_and_rejects_future_dates(client, db_session):
    _register(client)
    o = client.post("/api/outreach", json={"professor_name": "Dr. Kim"}).json()
    future = client.post("/api/outreach", json={"professor_name": "Dr. B", "sent_on": str(date.today() + timedelta(days=1))})
    assert future.status_code == 400
    _register(client)
    assert client.get("/api/outreach").json() == []
    assert client.patch(f"/api/outreach/{o['id']}", json={"status": "closed"}).status_code == 404
    assert client.delete(f"/api/outreach/{o['id']}").status_code == 404
