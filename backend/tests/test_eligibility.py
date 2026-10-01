"""Feature 1 unit tests: deterministic eligibility logic (no DB, no LLM)."""
import pytest

from app.services.eligibility import check_eligibility, convert_cgpa
from app.services.fields import match_field_deterministic

STUDENT = {
    "degree_level": "bachelors", "year_of_study": 3, "major": "Computer Science",
    "cgpa": 7.5, "cgpa_scale": 10, "nationality": "Indian", "country_of_residence": "UAE",
    "english_tests": {"IELTS": 7.0}, "skills": ["Python", "PyTorch"],
    "interests": ["machine learning", "robotics"],
}


def elig(**overrides):
    base = {
        "degree_levels": ["bachelors"], "min_year": None, "max_year": None, "min_cgpa": None,
        "nationality_allowed": ["any"], "nationality_excluded": [], "residency_required": None,
        "english_requirements": {}, "required_fields": [], "other_requirements": [],
    }
    base.update(overrides)
    return base


def test_convert_cgpa_linear():
    assert convert_cgpa(7.5, 10, 4) == pytest.approx(3.0)
    assert convert_cgpa(3.6, 4, 10) == pytest.approx(9.0)
    assert convert_cgpa(8.0, 10, 10) == 8.0


def test_fully_eligible():
    r = check_eligibility(STUDENT, elig(min_year=2, min_cgpa={"value": 3.0, "scale": 4},
                                        english_requirements={"IELTS": 6.5},
                                        required_fields=["computer science"]))
    assert r.verdict == "eligible"
    assert not r.blocking and not r.missing
    assert any("CGPA" in m for m in r.met)


def test_cgpa_converted_across_scales_and_blocks_when_below():
    # 7.5/10 == 3.0/4: exactly at the bar passes, 3.2/4 fails.
    assert check_eligibility(STUDENT, elig(min_cgpa={"value": 3.0, "scale": 4})).verdict == "eligible"
    r = check_eligibility(STUDENT, elig(min_cgpa={"value": 3.2, "scale": 4}))
    assert r.verdict == "not_eligible"
    assert "CGPA 3.2/4 required" in r.blocking[0]
    assert "≈3.00/4" in r.blocking[0]


def test_wrong_degree_level_is_not_eligible():
    r = check_eligibility(STUDENT, elig(degree_levels=["masters", "phd"]))
    assert r.verdict == "not_eligible"
    assert "Master's, PhD" in r.blocking[0]


def test_any_degree_level_is_ignored():
    assert check_eligibility(STUDENT, elig(degree_levels=["any"], min_year=1)).verdict == "eligible"


def test_year_bounds():
    assert check_eligibility(STUDENT, elig(min_year=4)).verdict == "not_eligible"
    assert check_eligibility(STUDENT, elig(max_year=2)).verdict == "not_eligible"
    assert check_eligibility(STUDENT, elig(min_year=2, max_year=3)).verdict == "eligible"


def test_missing_english_test_is_partial_with_explanation():
    student = {**STUDENT, "english_tests": {}}
    r = check_eligibility(student, elig(english_requirements={"IELTS": 6.5}))
    assert r.verdict == "partially_eligible"
    assert r.missing == ["IELTS 6.5 required, you have none"]


def test_any_one_english_test_suffices():
    student = {**STUDENT, "english_tests": {"TOEFL": 95}}
    assert check_eligibility(student, elig(english_requirements={"IELTS": 6.5, "TOEFL": 90})).verdict == "eligible"
    low = {**STUDENT, "english_tests": {"IELTS": 6.0}}
    r = check_eligibility(low, elig(english_requirements={"IELTS": 6.5}))
    assert r.verdict == "partially_eligible"
    assert "you have IELTS 6" in r.missing[0]


def test_nationality_allowed_and_excluded():
    assert check_eligibility(STUDENT, elig(nationality_excluded=["indian"])).verdict == "not_eligible"
    r = check_eligibility(STUDENT, elig(nationality_allowed=["Emirati"]))
    assert r.verdict == "not_eligible"
    assert "Open only to Emirati nationals" in r.blocking
    assert check_eligibility(STUDENT, elig(nationality_allowed=["Indian", "Pakistani"])).verdict == "eligible"


def test_residency():
    assert check_eligibility(STUDENT, elig(residency_required="UAE")).verdict == "eligible"
    assert check_eligibility(STUDENT, elig(residency_required="United Arab Emirates")).verdict == "eligible"
    assert check_eligibility(STUDENT, elig(residency_required="Qatar")).verdict == "not_eligible"


def test_fuzzy_field_match_via_synonyms():
    # A CS major interested in ML fits an "AI/ML" or "Engineering" requirement.
    assert check_eligibility(STUDENT, elig(required_fields=["AI/ML"])).verdict == "eligible"
    assert check_eligibility(STUDENT, elig(required_fields=["Engineering"])).verdict == "eligible"
    r = check_eligibility(STUDENT, elig(required_fields=["Medicine"]))
    assert r.verdict == "partially_eligible"
    assert "Medicine" in r.missing[0]


def test_field_matcher_handles_general_and_unknown_terms():
    assert match_field_deterministic("General", []) == "any"
    assert match_field_deterministic("AI", ["Computer Science"]) == "Computer Science"
    assert match_field_deterministic("Marine Biology", ["Computer Science"]) is None


def test_blocking_beats_missing():
    student = {**STUDENT, "english_tests": {}}
    r = check_eligibility(student, elig(degree_levels=["phd"], english_requirements={"IELTS": 7}))
    assert r.verdict == "not_eligible"
    assert r.missing  # still reported, so the student sees everything


def test_unknown_when_profile_lacks_data():
    r = check_eligibility({"degree_level": "bachelors"}, elig(min_cgpa={"value": 3.0, "scale": 4}))
    assert r.verdict == "unknown"
    assert "add your CGPA" in r.unknown[0]


def test_unknown_when_opportunity_states_nothing():
    assert check_eligibility(STUDENT, {}).verdict == "unknown"
    assert check_eligibility(STUDENT, None).verdict == "unknown"


def test_other_requirements_become_notes_not_verdict():
    r = check_eligibility(STUDENT, elig(other_requirements=["recommendation letter from supervisor"]))
    assert r.verdict == "eligible"
    assert r.notes == ["recommendation letter from supervisor"]


def test_opportunity_level_degree_levels_used_as_fallback():
    r = check_eligibility(STUDENT, {"min_year": 2}, degree_levels=["masters"])
    assert r.verdict == "not_eligible"
