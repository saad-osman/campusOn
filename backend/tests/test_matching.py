"""Feature 2 (match score), Feature 8 (NL search) and Feature 1 (CV upload)."""
import io
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

from app.models.opportunity import Opportunity
from app.services.matcher import deadline_component, score_opportunity
from app.services.rate_limit import reset_rate_limits
from app.services.search_parser import parse_query_rule_based

PROFILE = {
    "degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science", "cgpa": 7.5,
    "cgpa_scale": 10, "nationality": "Indian", "country_of_residence": "UAE",
    "english_tests": {"IELTS": 7.0}, "skills": ["Python"], "interests": ["machine learning"],
}


def _opp(**kw):
    base = dict(
        title="ML Research Internship", organization="Lab", fields=["AI/ML"], degree_levels=["bachelors"],
        description_summary="machine learning research", funding_type="fully_funded",
        deadline=date.today() + timedelta(days=30), embedding=None,
        eligibility={"degree_levels": ["bachelors"], "min_year": 2},
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_score_is_bounded_and_explained():
    result = score_opportunity(PROFILE, None, _opp())
    assert 0 <= result["score"] <= 100
    assert 1 <= len(result["reasons"]) <= 3
    assert "Matches your machine learning interest" in result["reasons"]
    assert set(result["components"]) == {"semantic", "eligibility", "fields", "deadline", "funding"}


def test_ineligible_and_off_topic_scores_lower():
    good = score_opportunity(PROFILE, None, _opp())["score"]
    bad = score_opportunity(PROFILE, None, _opp(
        fields=["Medicine"], title="Clinical fellowship", description_summary="hospital rotations",
        eligibility={"degree_levels": ["phd"]}, degree_levels=["phd"], funding_type="unfunded",
    ))
    assert bad["score"] < good
    assert any(r.startswith("Not eligible") for r in bad["reasons"])


def test_endorsement_boosts_score():
    plain = score_opportunity(PROFILE, None, _opp())["score"]
    endorsed = score_opportunity(PROFILE, None, _opp(), endorsed_by="Dr. X")
    assert endorsed["score"] >= plain
    assert "Recommended by Dr. X" in endorsed["reasons"]


def test_deadline_component():
    today = date(2027, 1, 1)
    assert deadline_component(None, today)[0] == 0.7
    assert deadline_component(date(2026, 12, 1), today)[0] == 0.0
    assert deadline_component(date(2027, 1, 4), today) == (0.3, "Only 3 days left to apply")
    assert deadline_component(date(2027, 1, 22), today)[1] == "Deadline in 21 days, enough time to prepare"


def test_rule_based_query_parser_spec_example():
    f = parse_query_rule_based("funded summer AI internships in Europe for 3rd year undergrads")
    assert f.degree_level == "bachelors"
    assert f.year == 3
    assert f.fields == ["AI/ML"]
    assert f.funding == "funded"
    assert f.regions == ["europe"]
    assert f.types == ["research_internship"]
    assert "summer" in f.semantic_query and "internships" in f.semantic_query


def test_rule_based_query_parser_more():
    f = parse_query_rule_based("fully funded PhD positions in the UAE closing this month")
    assert f.degree_level == "phd"
    assert f.funding == "fully_funded"
    assert f.regions == ["uae"]
    assert f.deadline_within_days == 30
    assert "research_position" in f.types
    assert parse_query_rule_based("robotics").semantic_query == "robotics"


# ---------- API ----------

def _login_student(client, db_session):
    reset_rate_limits()
    email = f"match-{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={"name": "Matcher", "email": email, "password": "password123"})
    client.patch("/api/profile", json={
        "degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science",
        "interests": ["machine learning"], "cgpa": 7.5, "cgpa_scale": 10,
    })


def _add(db, **kw):
    base = dict(organization="Org", type="research_internship", status="active", degree_levels=["bachelors"],
                fields=["AI/ML"], eligibility={"degree_levels": ["bachelors"]}, funding_type="fully_funded",
                deadline=date.today() + timedelta(days=40))
    base.update(kw)
    opp = Opportunity(**base)
    db.add(opp)
    db.commit()
    return opp


def test_list_includes_match_and_eligibility(client, db_session):
    _login_student(client, db_session)
    _add(db_session, title="ML Internship")
    body = client.get("/api/opportunities").json()
    card = next(o for o in body if o["title"] == "ML Internship")
    assert card["eligibility_check"]["verdict"] == "eligible"
    assert 0 <= card["match"]["score"] <= 100
    assert card["match"]["reasons"]


def test_search_interprets_query_and_filters(client, db_session):
    _login_student(client, db_session)
    _add(db_session, title="Funded ML Internship", funding_type="stipend")
    _add(db_session, title="Unfunded ML Internship", funding_type="unfunded")
    _add(db_session, title="PhD Fellowship", type="fellowship", degree_levels=["phd"], eligibility={"degree_levels": ["phd"]})

    res = client.post("/api/opportunities/search", json={"q": "funded AI internships for undergrads"})
    assert res.status_code == 200
    body = res.json()
    assert body["filters"]["funding"] == "funded"
    assert body["filters"]["degree_level"] == "bachelors"
    titles = [o["title"] for o in body["results"]]
    assert titles == ["Funded ML Internship"]

    # Removing the funding chip = resending the filters without it.
    filters = {**body["filters"], "funding": "any"}
    titles2 = [o["title"] for o in client.post("/api/opportunities/search", json={"filters": filters}).json()["results"]]
    assert set(titles2) == {"Funded ML Internship", "Unfunded ML Internship"}


def test_top_matches_hide_ineligible(client, db_session):
    _login_student(client, db_session)
    _add(db_session, title="Fits")
    _add(db_session, title="PhD only", degree_levels=["phd"], eligibility={"degree_levels": ["phd"]})
    titles = [o["title"] for o in client.get("/api/opportunities/matches/top").json()]
    assert "Fits" in titles and "PhD only" not in titles


def test_cv_upload_extracts_suggestions_without_saving_them(client, db_session):
    _login_student(client, db_session)
    cv = (
        "Priya Sharma\nB.E. Computer Science, BITS Pilani Dubai Campus, 3rd year\n"
        "CGPA: 8.4/10\nNationality: Indian\nIELTS 7.5\n"
        "Skills: Python, PyTorch, React, SQL\nResearch interests: computer vision, robotics\n"
    ).encode()
    res = client.post("/api/profile/cv", files={"file": ("cv.txt", io.BytesIO(cv), "text/plain")})
    assert res.status_code == 200, res.text
    s = res.json()["suggestions"]
    assert s["degree_level"] == "bachelors"
    assert s["year_of_study"] == 3
    assert s["cgpa"] == 8.4 and s["cgpa_scale"] == 10
    assert s["english_tests"] == {"IELTS": 7.5}
    assert s["country_of_residence"] == "UAE"
    assert "PyTorch" in s["skills"]
    assert "computer vision" in s["interests"]

    profile = client.get("/api/profile").json()
    assert profile["has_cv"] is True
    assert profile["cgpa"] == 7.5  # unchanged until the student confirms


def test_cv_upload_rejects_bad_files(client, db_session):
    _login_student(client, db_session)
    res = client.post("/api/profile/cv", files={"file": ("cv.exe", io.BytesIO(b"x" * 100), "application/octet-stream")})
    assert res.status_code == 400
    big = io.BytesIO(b"a" * (5 * 1024 * 1024 + 10))
    assert client.post("/api/profile/cv", files={"file": ("cv.txt", big, "text/plain")}).status_code == 413
