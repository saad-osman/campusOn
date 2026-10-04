from app.models.opportunity import Opportunity
from app.models.source import Source
from app.services.rate_limit import reset_rate_limits


def _register(client, email, role_via_db=None):
    res = client.post("/api/auth/register", json={"name": "Tester", "email": email, "password": "password123"})
    return res


def _make_opportunity(db_session, **overrides):
    source = Source(name="Test Source", base_url="https://example.com")
    db_session.add(source)
    db_session.flush()
    defaults = dict(
        title="Test Fellowship", organization="Test Org", type="fellowship",
        degree_levels=["masters"], fields=["AI/ML"], funding_type="fully_funded",
        status="active", overall_confidence=0.9,
    )
    defaults.update(overrides)
    opp = Opportunity(**defaults)
    db_session.add(opp)
    db_session.commit()
    return opp


def test_list_opportunities_requires_auth(client):
    client.cookies.clear()
    res = client.get("/api/opportunities")
    assert res.status_code == 401


def test_list_and_filter_opportunities(client, db_session):
    reset_rate_limits()
    _register(client, "opps1@example.com")
    _make_opportunity(db_session, title="AI Fellowship", fields=["AI/ML"])
    _make_opportunity(db_session, title="Policy Grant", fields=["Public Policy"], type="grant")

    all_res = client.get("/api/opportunities")
    assert all_res.status_code == 200
    assert len(all_res.json()) >= 2

    filtered = client.get("/api/opportunities?field=AI%2FML")
    titles = [o["title"] for o in filtered.json()]
    assert "AI Fellowship" in titles
    assert "Policy Grant" not in titles


def test_save_and_unsave_opportunity(client, db_session):
    reset_rate_limits()
    _register(client, "opps2@example.com")
    opp = _make_opportunity(db_session, title="Saveable Fellowship")

    save_res = client.post(f"/api/opportunities/{opp.id}/save")
    assert save_res.status_code == 204

    mine = client.get("/api/opportunities/saved/mine")
    assert any(o["id"] == opp.id for o in mine.json())

    unsave_res = client.delete(f"/api/opportunities/{opp.id}/save")
    assert unsave_res.status_code == 204
    mine2 = client.get("/api/opportunities/saved/mine")
    assert not any(o["id"] == opp.id for o in mine2.json())


def test_duplicate_hidden_from_default_listing(client, db_session):
    reset_rate_limits()
    _register(client, "opps3@example.com")
    canonical = _make_opportunity(db_session, title="Canonical Opp")
    _make_opportunity(db_session, title="Duplicate Opp", canonical_id=canonical.id)

    res = client.get("/api/opportunities")
    titles = [o["title"] for o in res.json()]
    assert "Canonical Opp" in titles
    assert "Duplicate Opp" not in titles


def test_sources_require_faculty_or_admin_role(client):
    reset_rate_limits()
    _register(client, "opps4@example.com")  # plain student
    res = client.get("/api/sources")
    assert res.status_code == 403


def test_admin_can_manage_sources(client, db_session):
    reset_rate_limits()
    _register(client, "opps5@example.com")
    # promote to admin directly via DB (no admin-creation endpoint by design -- Section 4.1)
    from app.models.user import User

    user = db_session.query(User).filter(User.email == "opps5@example.com").first()
    user.role = "admin"
    db_session.commit()

    create = client.post("/api/sources", json={"name": "New Source", "base_url": "https://new.example.com", "region": "uae"})
    assert create.status_code == 201
    source_id = create.json()["id"]

    listed = client.get("/api/sources")
    assert any(s["id"] == source_id for s in listed.json())

    patched = client.patch(f"/api/sources/{source_id}", json={"active": False})
    assert patched.status_code == 200
    assert patched.json()["active"] is False


def test_archive_sweep_endpoint(client, db_session):
    reset_rate_limits()
    _register(client, "opps6@example.com")
    from app.models.user import User

    user = db_session.query(User).filter(User.email == "opps6@example.com").first()
    user.role = "admin"
    db_session.commit()

    from datetime import date, timedelta
    _make_opportunity(db_session, title="Expired Soon", status="active", deadline=date.today() - timedelta(days=5))

    res = client.post("/api/sources/archive-sweep")
    assert res.status_code == 200
    assert res.json()["archived_count"] >= 1


def test_students_do_not_see_broken_or_pending_items(client, db_session):
    reset_rate_limits()
    _register(client, "opps7@example.com")
    visible = _make_opportunity(db_session, title="Visible Opp")
    broken = _make_opportunity(db_session, title="Broken Opp", status="broken")
    pending = _make_opportunity(db_session, title="Pending Opp", status="pending_review")

    titles = [o["title"] for o in client.get("/api/opportunities").json()]
    assert "Visible Opp" in titles
    assert "Broken Opp" not in titles and "Pending Opp" not in titles

    # even when asked explicitly
    assert client.get("/api/opportunities?status_filter=broken").json() == []
    assert client.get(f"/api/opportunities/{broken.id}").status_code == 404
    assert client.get(f"/api/opportunities/{pending.id}/changes").status_code == 404
    assert client.get(f"/api/opportunities/{visible.id}").status_code == 200


def test_expired_hidden_by_default_with_toggle(client, db_session):
    reset_rate_limits()
    _register(client, "opps8@example.com")
    _make_opportunity(db_session, title="Expired Opp", status="expired")

    default_titles = [o["title"] for o in client.get("/api/opportunities").json()]
    assert "Expired Opp" not in default_titles
    toggled = [o["title"] for o in client.get("/api/opportunities?include_expired=true").json()]
    assert "Expired Opp" in toggled


def test_staff_can_see_pending_review(client, db_session):
    reset_rate_limits()
    _register(client, "opps9@example.com")
    from app.models.user import User

    user = db_session.query(User).filter(User.email == "opps9@example.com").first()
    user.role = "faculty"
    db_session.commit()
    _make_opportunity(db_session, title="Needs Review", status="pending_review")

    res = client.get("/api/opportunities?status_filter=pending_review")
    assert [o["title"] for o in res.json()] == ["Needs Review"]


def test_merged_duplicate_counts_sources_and_changes(client, db_session):
    reset_rate_limits()
    _register(client, "opps10@example.com")
    from app.models.opportunity import OpportunityChange, OpportunitySource

    canonical = _make_opportunity(db_session, title="Canonical")
    dup = _make_opportunity(db_session, title="Dup", canonical_id=canonical.id)
    src_a = Source(name="A", base_url="https://a.example", region="uae")
    src_b = Source(name="B", base_url="https://b.example", region="europe")
    db_session.add_all([src_a, src_b])
    db_session.flush()
    db_session.add_all([
        OpportunitySource(opportunity_id=canonical.id, source_id=src_a.id, url="https://a.example/x"),
        OpportunitySource(opportunity_id=dup.id, source_id=src_b.id, url="https://b.example/x"),
        OpportunityChange(opportunity_id=dup.id, field="deadline", summary="Deadline extended"),
    ])
    db_session.commit()

    body = client.get(f"/api/opportunities/{canonical.id}").json()
    assert body["source_count"] == 2
    assert {s["name"] for s in body["sources"]} == {"A", "B"}
    changes = client.get(f"/api/opportunities/{canonical.id}/changes").json()
    assert [c["summary"] for c in changes] == ["Deadline extended"]
