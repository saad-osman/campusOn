"""Phase 5: tracker (F9), calendar export, outcomes, copilot (F4), professor finder (F3)."""
import uuid
from datetime import date, timedelta

from app.models.notification import Notification
from app.models.opportunity import Opportunity
from app.services import semantic_scholar
from app.services.ics_export import build_calendar
from app.services.rate_limit import reset_rate_limits


def _register(client, name="User"):
    reset_rate_limits()
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    client.cookies.clear()
    res = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
    return email, res.json()["id"]


def _login(client, email):
    reset_rate_limits()
    client.cookies.clear()
    client.post("/api/auth/login", json={"email": email, "password": "password123"})


def _opp(db, **kw):
    base = dict(title="Robotics Internship", organization="Lab", type="research_internship", status="active",
                degree_levels=["bachelors"], fields=["AI/ML"], eligibility={}, funding_type="stipend",
                deadline=date.today() + timedelta(days=20), description_summary="Robot learning research.")
    base.update(kw)
    opp = Opportunity(**base)
    db.add(opp)
    db.commit()
    return opp


def _file(client, name="Apps"):
    return client.post("/api/workspaces", json={"name": name, "template": "blank"}).json()["id"]


# ---------- tracker ----------

def test_tracker_add_move_reorder_and_activity(client, db_session):
    _register(client)
    ws = _file(client)
    a, b = _opp(db_session, title="A"), _opp(db_session, title="B")

    res = client.post(f"/api/workspaces/{ws}/tracker", json={"opportunity_id": a.id})
    assert res.status_code == 201
    card_a = res.json()
    assert card_a["status"] == "saved" and card_a["opportunity"]["title"] == "A"
    assert client.post(f"/api/workspaces/{ws}/tracker", json={"opportunity_id": a.id}).status_code == 409
    card_b = client.post(f"/api/workspaces/{ws}/tracker", json={"opportunity_id": b.id}).json()

    moved = client.patch(f"/api/tracker/{card_a['id']}", json={"status": "preparing"}).json()
    assert moved["status"] == "preparing"

    res = client.post(f"/api/workspaces/{ws}/tracker/reorder",
                      json={"columns": {"preparing": [card_b["id"], card_a["id"]], "saved": []}})
    assert res.status_code == 204
    board = client.get(f"/api/workspaces/{ws}/tracker").json()
    assert [(c["opportunity"]["title"], c["status"], c["position"]) for c in board] == [
        ("B", "preparing", 0), ("A", "preparing", 1)]

    actions = [x["action"] for x in client.get(f"/api/workspaces/{ws}/activity").json()]
    assert "tracker_added" in actions and "tracker_moved" in actions

    # Tracking also saves it, so change alerts reach the student.
    assert any(o["id"] == a.id for o in client.get("/api/opportunities/saved/mine").json())


def test_viewer_cannot_change_tracker_and_assignment_notifies(client, db_session):
    owner_email, owner_id = _register(client, "Owner")
    ws = _file(client)
    opp = _opp(db_session)
    card = client.post(f"/api/workspaces/{ws}/tracker", json={"opportunity_id": opp.id}).json()

    mate_email, mate_id = _register(client, "Mate")
    _login(client, owner_email)
    invite = client.post(f"/api/workspaces/{ws}/invites", json={"email": mate_email, "role": "viewer"}).json()
    # Existing users get an in-app notification about the invite.
    assert db_session.query(Notification).filter_by(user_id=mate_id, type="invite").count() == 1

    _login(client, mate_email)
    assert client.post(f"/api/invites/{invite['token']}/accept").status_code == 200
    assert client.patch(f"/api/tracker/{card['id']}", json={"status": "submitted"}).status_code == 403
    assert client.get(f"/api/workspaces/{ws}/tracker").status_code == 200

    _login(client, owner_email)
    res = client.patch(f"/api/tracker/{card['id']}", json={"assignee_id": mate_id})
    assert res.status_code == 200 and res.json()["assignee_name"] == "Mate"
    db_session.expire_all()
    note = db_session.query(Notification).filter_by(user_id=mate_id, type="assignment").one()
    assert "Robotics Internship" in note.title

    stranger_email, stranger_id = _register(client, "Stranger")
    _login(client, owner_email)
    assert client.patch(f"/api/tracker/{card['id']}", json={"assignee_id": stranger_id}).status_code == 400


def test_outcome_upsert(client, db_session):
    _register(client)
    opp = _opp(db_session)
    r1 = client.post("/api/outcomes", json={"opportunity_id": opp.id, "result": "waitlisted"})
    assert r1.status_code == 201
    client.post("/api/outcomes", json={"opportunity_id": opp.id, "result": "accepted", "share_anonymously": True})
    mine = client.get("/api/outcomes/mine").json()
    assert len(mine) == 1 and mine[0]["result"] == "accepted" and mine[0]["share_anonymously"]


# ---------- calendar ----------

def test_ics_has_event_and_two_alarms():
    opp = Opportunity(id="abc", title="DAAD RISE, Germany", organization="DAAD", deadline=date(2027, 3, 1), url=None)
    ics = build_calendar([opp, Opportunity(id="x", title="Rolling", organization="Y", deadline=None)])
    assert ics.startswith("BEGIN:VCALENDAR\r\n") and ics.endswith("END:VCALENDAR\r\n")
    assert ics.count("BEGIN:VEVENT") == 1
    assert "DTSTART;VALUE=DATE:20270301" in ics
    assert "TRIGGER:-P7D" in ics and "TRIGGER:-P1D" in ics
    assert "SUMMARY:Deadline: DAAD RISE\\, Germany" in ics
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))


def test_calendar_endpoints(client, db_session):
    _register(client)
    ws = _file(client, "Cal File")
    opp = _opp(db_session, title="Cal Opp")
    client.post(f"/api/workspaces/{ws}/tracker", json={"opportunity_id": opp.id})
    one = client.get(f"/api/opportunities/{opp.id}/calendar.ics")
    assert one.status_code == 200 and one.headers["content-type"].startswith("text/calendar")
    assert "Cal Opp" in one.text
    whole = client.get(f"/api/workspaces/{ws}/calendar.ics")
    assert whole.status_code == 200 and "Cal File deadlines" in whole.text
    rolling = _opp(db_session, title="Rolling", deadline=None)
    assert client.get(f"/api/opportunities/{rolling.id}/calendar.ics").status_code == 400


# ---------- copilot ----------

def test_kit_creates_labelled_drafts_without_inventing(client, db_session):
    _register(client, "Sara Student")
    client.patch("/api/profile", json={"degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science",
                                       "skills": ["Python"], "interests": ["robotics"]})
    opp = _opp(db_session, eligibility={"english_requirements": {"IELTS": 6.5},
                                        "other_requirements": ["recommendation letter from supervisor"]})
    res = client.post("/api/copilot/kit", json={
        "opportunity_id": opp.id,
        "professor": {"name": "Dr. Ada Lovelace (sample)", "paper_title": "Analytical Engines", "paper_year": 2024},
    })
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["method"] == "template"  # demo mode in tests
    docs = {d["type"]: d for d in body["documents"]}
    assert set(docs) == {"checklist", "sop", "cold_email"}
    for d in docs.values():
        assert d["content"].startswith("> **AI draft — edit before sending.**")
        assert d["opportunity_id"] == opp.id
    assert "- [ ] English test score report: IELTS 6.5 required (you have: none on your profile yet)" in docs["checklist"]["content"]
    assert "Recommendation letter from supervisor" in docs["checklist"]["content"]
    assert "3rd-year undergraduate Computer Science student" in docs["sop"]["content"]
    assert "[" in docs["sop"]["content"]  # gaps left for the student, not invented stories
    email = docs["cold_email"]["content"]
    assert "Analytical Engines" in email and "Dear Professor Lovelace" in email
    assert len(email.split("\n\n", 2)[2].split()) < 150

    # The kit lands in a new file, with the opportunity in "preparing".
    board = client.get(f"/api/workspaces/{body['workspace_id']}/tracker").json()
    assert board[0]["status"] == "preparing"


def test_single_draft_requires_editor(client, db_session):
    owner_email, _ = _register(client, "Owner")
    ws = _file(client)
    doc = client.post("/api/copilot/draft", json={"workspace_id": ws, "type": "cover_letter"})
    assert doc.status_code == 201 and doc.json()["title"] == "Cover letter"
    viewer_email, _ = _register(client, "Viewer")
    _login(client, owner_email)
    token = client.post(f"/api/workspaces/{ws}/invites", json={"email": viewer_email, "role": "viewer"}).json()["token"]
    _login(client, viewer_email)
    client.post(f"/api/invites/{token}/accept")
    assert client.post("/api/copilot/draft", json={"workspace_id": ws, "type": "sop"}).status_code == 403


# ---------- professors ----------

def test_highlight_and_ranking():
    assert semantic_scholar.highlight_for(["BITS Pilani, Dubai Campus"]) == "BITS Pilani"
    assert semantic_scholar.highlight_for(["Khalifa University"]) == "UAE"
    assert semantic_scholar.highlight_for(["MIT"]) is None
    papers = [
        {"title": "New", "year": date.today().year, "citationCount": 5, "authors": [{"authorId": "1", "name": "A"}]},
        {"title": "Old", "year": date.today().year - 7, "citationCount": 5, "authors": [{"authorId": "2", "name": "B"}]},
    ]
    ranked = semantic_scholar._rank_authors(papers, "q")
    assert [a["name"] for a in ranked] == ["A", "B"]


def test_professor_search_falls_back_to_sample_then_uses_cache(client, db_session, monkeypatch):
    _register(client)
    calls = {"n": 0}

    def unavailable(query):
        calls["n"] += 1
        raise semantic_scholar.ScholarUnavailable("429")

    monkeypatch.setattr(semantic_scholar, "fetch_live", unavailable)
    res = client.get("/api/professors?q=robotics drones").json()
    assert res["source"] == "sample"
    assert res["authors"] and all(a["sample"] for a in res["authors"])

    live = [{"author_id": "9", "name": "Real Person", "affiliations": ["MBZUAI"], "topics": ["CS"],
             "highlight": "UAE", "recent_papers": [{"title": "P", "year": 2025, "venue": None, "url": None, "citations": 1}]}]
    monkeypatch.setattr(semantic_scholar, "fetch_live", lambda q: live)
    assert client.get("/api/professors?q=nlp arabic").json()["source"] == "live"
    monkeypatch.setattr(semantic_scholar, "fetch_live", unavailable)
    cached = client.get("/api/professors?q=NLP  Arabic").json()  # normalised to the same cache key
    assert cached["source"] == "cache" and cached["authors"][0]["name"] == "Real Person"


def test_professor_query_from_opportunity_prefers_student_interests(client, db_session, monkeypatch):
    _register(client)
    client.patch("/api/profile", json={"interests": ["robotics", "poetry"]})
    opp = _opp(db_session, fields=["AI/ML", "Engineering"])
    seen = {}
    monkeypatch.setattr(semantic_scholar, "fetch_live", lambda q: seen.setdefault("q", q) and [])
    res = client.get(f"/api/professors?opportunity_id={opp.id}").json()
    assert res["query"] == "robotics"
