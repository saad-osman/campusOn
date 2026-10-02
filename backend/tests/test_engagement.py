"""Phase 6: notifications, change alerts (F5), digest + Telegram (F10), review queue (F6),
endorsements (F12), account deletion."""
import uuid
from datetime import date, datetime, timedelta

from app.models.notification import Notification
from app.models.opportunity import Opportunity, OpportunitySource, SavedOpportunity
from app.models.source import Source
from app.models.user import User
from app.services import digest as digest_service
from app.services import telegram_bot
from app.services.rate_limit import reset_rate_limits
from app.services.scrape_pipeline import archive_expired, ingest_page_text
from app.services.security import hash_password


def _register(client, name="Student"):
    reset_rate_limits()
    client.cookies.clear()
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    res = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
    return email, res.json()["id"]


def _staff(db, role="faculty"):
    email = f"{role}-{uuid.uuid4().hex[:8]}@example.com"
    u = User(email=email, name=f"Dr. {role.title()}", role=role, password_hash=hash_password("password123"))
    db.add(u)
    db.commit()
    return email, u


def _login(client, email):
    reset_rate_limits()
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": email, "password": "password123"}).status_code == 200


def _opp(db, **kw):
    base = dict(title="ML Internship", organization="Lab", type="research_internship", status="active",
                degree_levels=["bachelors"], fields=["AI/ML"], eligibility={}, funding_type="stipend",
                deadline=date.today() + timedelta(days=30))
    base.update(kw)
    opp = Opportunity(**base)
    db.add(opp)
    db.commit()
    return opp


# ---------- notifications + change alerts ----------

def test_notification_endpoints(client, db_session):
    _, uid = _register(client)
    db_session.add_all([Notification(user_id=uid, type="system", title=f"n{i}") for i in range(3)])
    db_session.commit()
    body = client.get("/api/notifications").json()
    assert body["unread_count"] == 3 and len(body["items"]) == 3
    client.post(f"/api/notifications/{body['items'][0]['id']}/read")
    assert client.get("/api/notifications").json()["unread_count"] == 2
    client.post("/api/notifications/read-all")
    assert client.get("/api/notifications").json()["unread_count"] == 0
    _register(client)  # someone else can't mark it
    assert client.post(f"/api/notifications/{body['items'][0]['id']}/read").status_code == 404


def test_rescrape_change_alerts_followers(client, db_session):
    _, follower = _register(client, "Follower")
    _, bystander = _register(client, "Bystander")
    source = Source(name="Src", base_url="https://src.example.com", region="europe")
    db_session.add(source)
    db_session.commit()
    text = "Alerted Fellowship\nAlert Org\nFully funded fellowship in machine learning for undergraduates.\n" \
           "CGPA 3.0/4.0. Location: Germany. Deadline: {d}"
    d1 = date.today() + timedelta(days=40)
    ingest_page_text(db_session, source, "https://src.example.com/f", text.format(d=d1.strftime("%B %d, %Y")))
    opp = db_session.query(OpportunitySource).filter_by(url="https://src.example.com/f").one().opportunity_id
    db_session.add(SavedOpportunity(user_id=follower, opportunity_id=opp))
    db_session.commit()

    d2 = d1 + timedelta(days=14)
    ingest_page_text(db_session, source, "https://src.example.com/f", text.format(d=d2.strftime("%B %d, %Y")))
    alerts = db_session.query(Notification).filter_by(type="change_alert").all()
    assert [a.user_id for a in alerts] == [follower]
    assert "Deadline extended" in alerts[0].title and alerts[0].link == f"/opportunities/{opp}"


def test_change_alerts_respect_preferences(client, db_session):
    _, uid = _register(client)
    client.patch("/api/settings/notifications", json={"change_alerts": False})
    opp = _opp(db_session, deadline=date.today() - timedelta(days=1))
    db_session.add(SavedOpportunity(user_id=uid, opportunity_id=opp.id))
    db_session.commit()
    assert archive_expired(db_session) >= 1
    assert db_session.query(Notification).filter_by(user_id=uid, type="change_alert").count() == 0


# ---------- digest + Telegram ----------

def test_digest_contents_and_delivery(client, db_session):
    email, uid = _register(client, "Digest Reader")
    client.patch("/api/profile", json={"degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science",
                                       "interests": ["machine learning"]})
    soon = _opp(db_session, title="Closing Soon", deadline=date.today() + timedelta(days=3))
    client.post(f"/api/opportunities/{soon.id}/save")
    user = db_session.get(User, uid)

    d = digest_service.build_digest(db_session, user, since=datetime.utcnow() - timedelta(days=7))
    assert [x["title"] for x in d["deadlines"]] == ["Closing Soon"]
    text = digest_service.render_text(user, d)
    assert "Deadlines in the next 7 days" in text and "Closing Soon" in text

    result = digest_service.send_digest(db_session, user, skip_empty=False)
    assert result["in_app"] and not result["email"] and not result["telegram"]  # no SMTP/bot in tests
    note = db_session.query(Notification).filter_by(user_id=uid, type="digest").one()
    assert note.title.startswith("Your weekly digest")


def test_admin_send_digest_now(client, db_session):
    _register(client)
    assert client.post("/api/admin/digest/send").status_code == 403
    admin_email, _ = _staff(db_session, "admin")
    _login(client, admin_email)
    res = client.post("/api/admin/digest/send")
    assert res.status_code == 200 and res.json()["in_app"] >= 1


def test_telegram_linking_and_commands(client, db_session):
    _, uid = _register(client, "Tele User")
    code = client.post("/api/settings/telegram/code").json()["code"]
    assert telegram_bot.handle_message(db_session, "555", "/matches").startswith("This chat isn't connected")
    assert "invalid or has expired" in telegram_bot.handle_message(db_session, "555", "/start WRONG1")
    assert telegram_bot.handle_message(db_session, "555", f"/start {code}").startswith("Connected!")
    db_session.expire_all()
    assert db_session.get(User, uid).telegram_chat_id == "555"
    assert client.get("/api/settings/notifications").json()["telegram_connected"] is True
    # codes are single-use
    assert "invalid" in telegram_bot.handle_message(db_session, "556", f"/start {code}")
    assert "No saved deadlines" in telegram_bot.handle_message(db_session, "555", "/deadlines")
    assert "Lodestar week" in telegram_bot.handle_message(db_session, "555", "/digest")
    client.delete("/api/settings/telegram")
    db_session.expire_all()
    assert db_session.get(User, uid).telegram_chat_id is None


def test_telegram_code_expires(client, db_session):
    _, uid = _register(client)
    code = client.post("/api/settings/telegram/code").json()["code"]
    user = db_session.get(User, uid)
    user.telegram_link_expires_at = datetime.utcnow() - timedelta(minutes=1)
    db_session.commit()
    assert "expired" in telegram_bot.handle_message(db_session, "777", f"/start {code}")


# ---------- review queue (F6) ----------

def test_review_queue_requires_staff_and_approval_verifies(client, db_session):
    _, follower = _register(client)
    pending = _opp(db_session, title="Pending One", status="pending_review", overall_confidence=0.4, deadline=None)
    assert client.get("/api/review/queue").status_code == 403
    db_session.add(SavedOpportunity(user_id=follower, opportunity_id=pending.id))
    db_session.commit()

    fac_email, fac = _staff(db_session)
    _login(client, fac_email)
    queue = client.get("/api/review/queue").json()
    assert any(o["id"] == pending.id for o in queue)
    detail = client.get(f"/api/review/{pending.id}").json()
    assert detail["opportunity"]["title"] == "Pending One"

    new_deadline = (date.today() + timedelta(days=60)).isoformat()
    res = client.patch(f"/api/review/{pending.id}", json={
        "action": "approve", "edits": {"title": "Pending One (fixed)", "deadline": new_deadline}})
    assert res.status_code == 200
    body = res.json()
    assert body["verified"] is True and body["status"] == "active" and body["title"] == "Pending One (fixed)"
    assert body["confidence"]["deadline"] == 1.0
    db_session.expire_all()
    assert db_session.get(Opportunity, pending.id).verified_by == fac.id
    # The deadline correction reached the follower as a change alert.
    assert db_session.query(Notification).filter_by(user_id=follower, type="change_alert").count() == 1

    other = _opp(db_session, title="Junk", status="pending_review")
    assert client.patch(f"/api/review/{other.id}", json={"action": "reject"}).json()["status"] == "broken"
    assert any(o["id"] == other.id for o in client.get("/api/review/queue?kind=broken").json())


# ---------- endorsements (F12) ----------

def test_endorsement_notifies_targeted_students_and_boosts(client, db_session):
    s1_email, s1 = _register(client, "Third Year CS")
    client.patch("/api/profile", json={"degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science"})
    _, s2 = _register(client, "First Year Bio")
    client.patch("/api/profile", json={"degree_level": "bachelors", "year_of_study": 1, "major": "Biology"})
    opp = _opp(db_session, title="Endorsed Internship")

    fac_email, _ = _staff(db_session)
    _login(client, fac_email)
    res = client.post("/api/endorsements", json={"opportunity_id": opp.id, "note": "Great for our 3rd years",
                                                  "target_year": 3, "target_major": "Computer Science"})
    assert res.status_code == 201 and res.json()["notified"] >= 1  # other tests' students may match too
    assert db_session.query(Notification).filter_by(user_id=s1, type="endorsement").count() == 1
    assert db_session.query(Notification).filter_by(user_id=s2, type="endorsement").count() == 0
    assert len(client.get("/api/endorsements/mine").json()) == 1

    _login(client, s1_email)
    mine = client.get("/api/endorsements/for-me").json()
    assert [o["title"] for o in mine] == ["Endorsed Internship"]
    card = client.get(f"/api/opportunities/{opp.id}").json()
    assert card["endorsements"][0]["note"] == "Great for our 3rd years"
    assert "Recommended by Dr. Faculty" in card["match"]["reasons"]
    assert client.post("/api/endorsements", json={"opportunity_id": opp.id}).status_code == 403


# ---------- account deletion ----------

def test_delete_account_removes_personal_data_and_hands_over_shared_files(client, db_session):
    owner_email, owner = _register(client, "Leaving Owner")
    client.patch("/api/profile", json={"major": "CS"})
    solo = client.post("/api/workspaces", json={"name": "Solo", "template": "blank"}).json()["id"]
    shared = client.post("/api/workspaces", json={"name": "Shared", "template": "single_application"}).json()["id"]
    opp = _opp(db_session)
    client.post(f"/api/opportunities/{opp.id}/save")
    mate_email, mate = _register(client, "Mate")
    _login(client, owner_email)
    token = client.post(f"/api/workspaces/{shared}/invites", json={"email": mate_email, "role": "editor"}).json()["token"]
    _login(client, mate_email)
    client.post(f"/api/invites/{token}/accept")

    _login(client, owner_email)
    export = client.get("/api/settings/export").json()
    assert export["user"]["email"] == owner_email and len(export["application_files"]) == 2
    assert export["saved_opportunities"][0]["id"] == opp.id
    assert client.delete("/api/settings/account").status_code == 204

    db_session.expire_all()
    assert db_session.get(User, owner) is None
    assert db_session.query(SavedOpportunity).filter_by(user_id=owner).count() == 0
    _login(client, mate_email)
    files = client.get("/api/workspaces").json()
    assert [(f["name"], f["my_role"]) for f in files] == [("Shared", "owner")]
    assert client.get(f"/api/workspaces/{solo}").status_code == 404
