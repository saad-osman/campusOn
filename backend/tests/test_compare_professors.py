"""Compare page researchers: snapshot/cache -> AI cache -> LLM -> sample, never live Semantic Scholar."""
import uuid
from datetime import date, timedelta

import pytest

from app.models.api_cache import ApiCache
from app.models.opportunity import Opportunity
from app.services import llm, semantic_scholar
from app.services.rate_limit import reset_rate_limits


@pytest.fixture(autouse=True)
def no_live_calls(monkeypatch):
    def boom(query):
        raise AssertionError(f"compare must never call Semantic Scholar live (query {query!r})")

    monkeypatch.setattr(semantic_scholar, "fetch_live", boom)


def _register(client):
    reset_rate_limits()
    client.cookies.clear()
    email = f"{uuid.uuid4().hex[:10]}@example.com"
    client.post("/api/auth/register", json={"name": "Cmp", "email": email, "password": "password123"})


def _opp(db, **kw):
    base = dict(title="Robotics Internship", organization="Khalifa University", type="research_internship",
                status="active", degree_levels=["bachelors"], fields=["AI/ML"], eligibility={},
                funding_type="stipend", deadline=date.today() + timedelta(days=20))
    base.update(kw)
    opp = Opportunity(**base)
    db.add(opp)
    db.commit()
    return opp


def _llm_on(monkeypatch, responses):
    """LLM enabled; complete_json returns each item of `responses` in turn. Returns the call log."""
    calls = []

    def fake(system, user, **kw):
        calls.append(user)
        return responses[min(len(calls), len(responses)) - 1]

    monkeypatch.setattr(llm, "llm_enabled", lambda: True)
    monkeypatch.setattr(llm, "complete_json", fake)
    return calls


def _compare(client, *ids):
    return client.get(f"/api/professors/compare?ids={','.join(ids)}")


def test_snapshot_cache_is_used_without_llm(client, db_session, monkeypatch):
    _register(client)
    opp = _opp(db_session)  # AI/ML, no interests -> query "machine learning"
    db_session.add(ApiCache(key=semantic_scholar.cache_key("machine learning"), namespace="semantic_scholar",
                            payload={"authors": [
                                {"name": f"Researcher {i}", "affiliations": [f"Uni {i}", "Other"], "topics": ["CS", "Math"],
                                 "profile_url": f"https://example.org/{i}"} for i in range(5)
                            ]}))
    db_session.commit()
    calls = _llm_on(monkeypatch, [{"researchers": []}])

    res = _compare(client, opp.id)
    assert res.status_code == 200
    [row] = res.json()
    assert row["opportunity_id"] == opp.id and row["query"] == "machine learning"
    assert row["source"] == "cache"
    assert len(row["authors"]) == 3
    assert row["authors"][0] == {"name": "Researcher 0", "affiliation": "Uni 0", "topic": "CS",
                                 "profile_url": "https://example.org/0"}
    assert calls == []


def test_llm_suggestions_are_cached(client, db_session, monkeypatch):
    _register(client)
    opp = _opp(db_session)
    calls = _llm_on(monkeypatch, [{"researchers": [
        {"name": "Dr. Real Person", "affiliation": "Khalifa University", "topic": "robot learning"},
    ]}])

    [row] = _compare(client, opp.id).json()
    assert row["source"] == "ai"
    assert row["authors"] == [{"name": "Dr. Real Person", "affiliation": "Khalifa University",
                               "topic": "robot learning", "profile_url": None}]
    assert len(calls) == 1 and "Khalifa University" in calls[0]
    stored = db_session.query(ApiCache).filter(ApiCache.key == semantic_scholar.llm_cache_key("machine learning")).one()
    assert stored.namespace == "llm_professors"

    [again] = _compare(client, opp.id).json()
    assert again["source"] == "ai" and again["authors"] == row["authors"]
    assert len(calls) == 1  # served from the llm_professors cache


def test_demo_mode_falls_back_to_sample(client, db_session):
    _register(client)
    opp = _opp(db_session)
    assert not llm.llm_enabled()  # tests run with DEMO_MODE=true

    [row] = _compare(client, opp.id).json()
    assert row["source"] == "sample"
    assert 1 <= len(row["authors"]) <= 3
    assert all("(sample)" in a["name"] for a in row["authors"])


def test_invalid_llm_output_retried_once_then_sample(client, db_session, monkeypatch):
    _register(client)
    opp = _opp(db_session)
    monkeypatch.setattr(llm.settings, "LLM_PROVIDER", "gemini")
    monkeypatch.setattr(llm.settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm.settings, "DEMO_MODE", False)
    posts = []

    class _Resp:
        status_code = 200
        text = "not json"

        def json(self):
            return {"choices": [{"message": {"content": "Sure! Here are some researchers..."}, "finish_reason": "stop"}]}

    def fake_post(url, headers, json, timeout):
        posts.append(json)
        return _Resp()

    monkeypatch.setattr(llm.httpx, "post", fake_post)

    [row] = _compare(client, opp.id).json()
    assert row["source"] == "sample"
    assert len(posts) == 2  # one retry, then give up


def test_schema_invalid_llm_output_retried_once(client, db_session, monkeypatch):
    _register(client)
    opp = _opp(db_session)
    calls = _llm_on(monkeypatch, [{"researchers": "nobody"}, {"researchers": [{"name": "Dr. Second Try"}]}])

    [row] = _compare(client, opp.id).json()
    assert row["source"] == "ai" and row["authors"][0]["name"] == "Dr. Second Try"
    assert len(calls) == 2


def test_more_than_four_ids_is_rejected(client, db_session):
    _register(client)
    ids = [_opp(db_session, title=f"O{i}").id for i in range(5)]
    assert _compare(client, *ids).status_code == 400


def test_unknown_and_invisible_ids_are_skipped(client, db_session):
    _register(client)
    visible = _opp(db_session)
    hidden = _opp(db_session, status="pending_review")
    broken = _opp(db_session, status="broken")

    rows = _compare(client, visible.id, hidden.id, broken.id, "no-such-id").json()
    assert [r["opportunity_id"] for r in rows] == [visible.id]
