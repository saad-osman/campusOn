"""Phase 7: admin analytics (F13), public API / RSS (F14), CORS split."""
import uuid
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta

from app.models.opportunity import Opportunity, OpportunitySource, SavedOpportunity
from app.models.outcome import Outcome
from app.models.source import Source
from app.models.user import User
from app.services.analytics import build_analytics, term_of
from app.services.rate_limit import reset_rate_limits
from app.services.security import hash_password


def _admin(client, db):
    email = f"admin-{uuid.uuid4().hex[:8]}@example.com"
    db.add(User(email=email, name="Admin", role="admin", password_hash=hash_password("password123")))
    db.commit()
    reset_rate_limits()
    client.cookies.clear()
    client.post("/api/auth/login", json={"email": email, "password": "password123"})


def _opp(db, region="uae", **kw):
    src = Source(name=f"S-{uuid.uuid4().hex[:6]}", base_url="https://x.example.com", region=region)
    db.add(src)
    db.flush()
    base = dict(title="Public Opp", organization="Org", type="research_internship", status="active",
                degree_levels=["bachelors"], fields=["AI/ML"], eligibility={}, funding_type="stipend",
                deadline=date.today() + timedelta(days=30))
    base.update(kw)
    opp = Opportunity(**base)
    db.add(opp)
    db.flush()
    db.add(OpportunitySource(opportunity_id=opp.id, source_id=src.id, url=f"https://x.example.com/{opp.id}"))
    db.commit()
    return opp


def test_term_of():
    assert term_of(datetime(2026, 3, 1)) == "Spring 2026"
    assert term_of(datetime(2026, 7, 1)) == "Summer 2026"
    assert term_of(datetime(2026, 10, 1)) == "Fall 2026"


def test_analytics_contents(db_session):
    a = _opp(db_session, region="uae", title="A", verified=True)
    _opp(db_session, region="europe", title="B", type="fellowship", funding_type="fully_funded")
    _opp(db_session, title="Pending", status="pending_review", overall_confidence=0.3)
    student = User(email=f"s-{uuid.uuid4().hex[:6]}@example.com", name="S", role="student", password_hash="x")
    db_session.add(student)
    db_session.flush()
    db_session.add(SavedOpportunity(user_id=student.id, opportunity_id=a.id))
    db_session.add(Outcome(user_id=student.id, opportunity_id=a.id, result="accepted", share_anonymously=True))
    db_session.add(Outcome(user_id=student.id, opportunity_id=a.id, result="accepted", share_anonymously=False))
    db_session.commit()

    data = build_analytics(db_session)
    h = data["headline"]
    assert h["active_opportunities"] == 2 and h["verified_pct"] == 50 and h["pending_review"] == 1
    assert h["students_with_application"] >= 1
    assert {r["name"] for r in data["by_region"]} == {"uae", "europe"}
    assert {r["name"]: r["count"] for r in data["by_type"]} == {"research_internship": 1, "fellowship": 1}
    assert len(data["new_per_week"]) == 12 and data["new_per_week"][-1]["count"] >= 3
    assert data["activity_per_week"][-1]["saves"] >= 1
    assert data["success_stories"] == ["1 BPDC student was accepted to A this year"]  # only the shared one
    assert data["outcomes_per_term"][-1]["accepted"] == 2


def test_analytics_endpoints_admin_only(client, db_session):
    _opp(db_session)
    reset_rate_limits()
    client.cookies.clear()
    client.post("/api/auth/register", json={"name": "S", "email": f"{uuid.uuid4().hex[:8]}@e.com", "password": "password123"})
    assert client.get("/api/admin/analytics").status_code == 403
    _admin(client, db_session)
    assert client.get("/api/admin/analytics").json()["headline"]["active_opportunities"] >= 1
    csv = client.get("/api/admin/analytics.csv")
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    assert csv.text.splitlines()[0] == "section,label,value,extra"
    assert "headline,active_opportunities," in csv.text


def test_public_api_lists_only_open_listings_without_personal_data(client, db_session):
    live = _opp(db_session, title="Live UAE", region="uae")
    _opp(db_session, title="Europe One", region="europe", fields=["Public Policy"], degree_levels=["masters"])
    _opp(db_session, title="Broken", status="broken")
    _opp(db_session, title="Pending", status="pending_review")
    _opp(db_session, title="Past", deadline=date.today() - timedelta(days=1))
    client.cookies.clear()  # no login needed

    res = client.get("/api/public/opportunities", headers={"Origin": "https://portal.example.edu"})
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "*"
    titles = {o["title"] for o in res.json()}
    assert titles == {"Live UAE", "Europe One"}
    item = next(o for o in res.json() if o["title"] == "Live UAE")
    assert set(item) >= {"scholarradar_url", "regions", "deadline"}
    assert not {"match", "saved", "eligibility_check", "endorsements", "confidence"} & set(item)

    assert [o["title"] for o in client.get("/api/public/opportunities?region=uae").json()] == ["Live UAE"]
    assert [o["title"] for o in client.get("/api/public/opportunities?degree=masters").json()] == ["Europe One"]
    assert [o["title"] for o in client.get("/api/public/opportunities?field=computer science").json()] == ["Live UAE"]
    assert len(client.get("/api/public/opportunities?limit=1").json()) == 1
    assert client.get(f"/api/public/opportunities/{live.id}").json()["title"] == "Live UAE"


def test_rss_feed_is_valid_xml(client, db_session):
    _opp(db_session, title="Feed <Item> & Co")
    res = client.get("/feed.xml?region=uae")
    assert res.status_code == 200 and "rss" in res.headers["content-type"]
    root = ET.fromstring(res.text)
    titles = [i.findtext("title") for i in root.iter("item")]
    assert "Feed <Item> & Co" in titles


def test_private_api_cors_stays_locked(client):
    res = client.options("/api/opportunities", headers={
        "Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"})
    assert res.headers.get("access-control-allow-origin") != "*"
    ok = client.options("/api/opportunities", headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert ok.headers.get("access-control-allow-credentials") == "true"


def test_simulate_change_alerts_followers(client, db_session):
    from app.models.notification import Notification

    opp = _opp(db_session, title="Followed")
    reset_rate_limits()
    client.cookies.clear()
    res = client.post("/api/auth/register", json={"name": "F", "email": f"{uuid.uuid4().hex[:8]}@e.com", "password": "password123"})
    follower = res.json()["id"]
    client.post(f"/api/opportunities/{opp.id}/save")
    _admin(client, db_session)
    body = client.post("/api/admin/demo/simulate-change").json()
    assert body["title"] == "Followed" and body["summary"].startswith("Deadline extended")
    assert db_session.query(Notification).filter_by(user_id=follower, type="change_alert").count() == 1
