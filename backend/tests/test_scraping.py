import json
from datetime import datetime, timedelta

import pytest

from app.models.opportunity import Opportunity, OpportunityChange, OpportunitySource
from app.models.scrape_run import ScrapeRun
from app.models.source import RawPage, Source
from app.services import extractor, scrape_pipeline
from app.services.extractor import extract_rule_based
from app.services.scrape_pipeline import archive_expired, ingest_page_text, run_scrape_for_source
from app.services.scraper import ScrapeBlocked


DAAD_TEXT = """DAAD Graduate School Scholarship Programme
German Academic Exchange Service (DAAD)
Fully funded Master's and PhD scholarships for international students in Germany.
Eligibility: Bachelor's degree completed with strong academic record. CGPA of 3.00/4.0 recommended.
Funding: Fully funded - monthly stipend of 934 EUR, travel allowance, health insurance.
Field: Engineering, Natural Sciences, Computer Science
Location: Germany
Deadline: October 15, 2027"""

DAAD_TEXT_MIRROR = """DAAD Graduate School Scholarship Programme
German Academic Exchange Service (DAAD)
Listed by your home university's international office. Fully funded scholarship for Master's
and PhD students in Germany.
Eligibility: CGPA of 3.00/4.0 minimum.
Funding: Fully funded - monthly stipend of 934 EUR.
Field: Engineering, Natural Sciences
Location: Germany
Deadline: October 15, 2027"""

SPARSE_TEXT = """Opportunity announcement.
Contact department office.
See attached flyer."""


def test_extract_rule_based_basic_fields():
    data = extract_rule_based(DAAD_TEXT, "DAAD", "https://daad.de")
    assert data["title"] == "DAAD Graduate School Scholarship Programme"
    assert data["organization"] == "German Academic Exchange Service (DAAD)"
    assert data["funding_type"] == "fully_funded"
    assert data["deadline"] == "2027-10-15"
    assert data["eligibility"]["min_cgpa"] == {"value": 3.0, "scale": 4.0}
    assert data["overall_confidence"] > 0.6


def test_extract_rule_based_sparse_is_low_confidence():
    data = extract_rule_based(SPARSE_TEXT, "Newsletter", "https://example.com")
    assert data["overall_confidence"] < 0.5


def test_ingest_inserts_new_opportunity(db_session):
    source = Source(name="DAAD", base_url="https://daad.de")
    db_session.add(source)
    db_session.flush()

    result = ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT)
    assert result["action"] == "inserted"

    opp = db_session.get(Opportunity, result["opportunity_id"])
    assert opp.organization == "German Academic Exchange Service (DAAD)"
    assert opp.canonical_id is None
    assert opp.status == "active"  # has deadline + confidence > 0.7


def test_ingest_same_url_twice_is_unchanged_not_duplicated(db_session):
    source = Source(name="DAAD", base_url="https://daad.de")
    db_session.add(source)
    db_session.flush()

    first = ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT)
    second = ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT)
    assert second["action"] == "unchanged"

    count = db_session.query(Opportunity).count()
    assert count == 1


def test_ingest_dedupes_across_sources(db_session):
    source_a = Source(name="DAAD", base_url="https://daad.de")
    source_b = Source(name="Partner Mirror", base_url="https://partner.example.edu")
    db_session.add_all([source_a, source_b])
    db_session.flush()

    first = ingest_page_text(db_session, source_a, "https://daad.de/page", DAAD_TEXT)
    second = ingest_page_text(db_session, source_b, "https://partner.example.edu/page", DAAD_TEXT_MIRROR)

    assert first["action"] == "inserted"
    assert second["action"] == "merged"
    assert second["canonical_id"] == first["opportunity_id"]

    # exactly one canonical opportunity, one linked duplicate
    canonical_count = db_session.query(Opportunity).filter(Opportunity.canonical_id.is_(None)).count()
    duplicate_count = db_session.query(Opportunity).filter(Opportunity.canonical_id.isnot(None)).count()
    assert canonical_count == 1
    assert duplicate_count == 1

    sources_linked = db_session.query(OpportunitySource).filter(
        OpportunitySource.opportunity_id.in_([first["opportunity_id"], second["opportunity_id"]])
    ).count()
    assert sources_linked == 2


def test_ingest_records_changes_on_rescrape(db_session):
    source = Source(name="DAAD", base_url="https://daad.de")
    db_session.add(source)
    db_session.flush()

    first = ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT)

    changed_text = DAAD_TEXT.replace("October 15, 2027", "November 1, 2027")
    second = ingest_page_text(db_session, source, "https://daad.de/page", changed_text)
    assert second["action"] == "updated"
    assert second["opportunity_id"] == first["opportunity_id"]

    changes = db_session.query(OpportunityChange).filter(
        OpportunityChange.opportunity_id == first["opportunity_id"]
    ).all()
    deadline_changes = [c for c in changes if c.field == "deadline"]
    assert len(deadline_changes) == 1
    assert deadline_changes[0].old_value == "2027-10-15"
    assert deadline_changes[0].new_value == "2027-11-01"
    assert deadline_changes[0].summary == "Deadline extended: 15 Oct 2027 → 1 Nov 2027"
    # confidence/text-only fields don't produce timeline noise
    assert {c.field for c in changes} <= {"deadline", "eligibility", "funding_type", "funding_amount", "status"}


def test_sparse_page_flagged_pending_review(db_session):
    source = Source(name="Newsletter", base_url="https://example.com")
    db_session.add(source)
    db_session.flush()

    result = ingest_page_text(db_session, source, "https://example.com/p", SPARSE_TEXT)
    opp = db_session.get(Opportunity, result["opportunity_id"])
    assert opp.status == "pending_review"


def test_archive_expired_moves_past_deadline_to_expired(db_session):
    source = Source(name="Mitacs", base_url="https://mitacs.ca")
    db_session.add(source)
    db_session.flush()

    past_text = DAAD_TEXT.replace("October 15, 2027", "January 1, 2020")
    result = ingest_page_text(db_session, source, "https://mitacs.ca/page", past_text)
    opp = db_session.get(Opportunity, result["opportunity_id"])
    opp.status = "active"  # force active so the sweep has something to do
    db_session.commit()

    count = archive_expired(db_session)
    assert count == 1
    db_session.refresh(opp)
    assert opp.status == "expired"


def test_archive_sweep_records_status_change(db_session):
    source = Source(name="Mitacs", base_url="https://mitacs.ca")
    db_session.add(source)
    db_session.flush()
    opp = Opportunity(title="Old", organization="Org", status="active",
                      deadline=(datetime.utcnow() - timedelta(days=3)).date())
    db_session.add(opp)
    db_session.commit()

    archive_expired(db_session)
    change = db_session.query(OpportunityChange).filter_by(opportunity_id=opp.id).one()
    assert change.field == "status"
    assert change.summary == "Applications have closed"


def test_unchanged_page_refreshes_last_checked_without_new_raw_page(db_session):
    source = Source(name="DAAD", base_url="https://daad.de")
    db_session.add(source)
    db_session.flush()
    first = ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT)
    opp = db_session.get(Opportunity, first["opportunity_id"])
    opp.last_checked = datetime(2020, 1, 1)
    db_session.commit()

    ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT)
    db_session.refresh(opp)
    assert opp.last_checked > datetime(2020, 1, 2)
    assert db_session.query(RawPage).count() == 1


def test_changed_content_clears_faculty_verification(db_session):
    source = Source(name="DAAD", base_url="https://daad.de")
    db_session.add(source)
    db_session.flush()
    first = ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT)
    opp = db_session.get(Opportunity, first["opportunity_id"])
    opp.verified = True
    db_session.commit()

    ingest_page_text(db_session, source, "https://daad.de/page", DAAD_TEXT.replace("Fully funded", "Partial funding"))
    db_session.refresh(opp)
    assert opp.verified is False
    fields = {c.field for c in db_session.query(OpportunityChange).filter_by(opportunity_id=opp.id)}
    assert "funding_type" in fields


def _source_with_opportunity(db_session, url="https://gone.example.edu/prog"):
    source = Source(name="Gone", base_url=url)
    db_session.add(source)
    db_session.flush()
    result = ingest_page_text(db_session, source, url, DAAD_TEXT)
    return source, db_session.get(Opportunity, result["opportunity_id"])


def test_two_consecutive_404s_mark_broken(db_session, monkeypatch):
    source, opp = _source_with_opportunity(db_session)
    monkeypatch.setattr(scrape_pipeline, "fetch_page", lambda url: ("", 404))

    run_scrape_for_source(db_session, source)
    db_session.refresh(opp)
    assert opp.status == "active" and opp.broken_count == 1

    run = run_scrape_for_source(db_session, source)
    db_session.refresh(opp)
    assert opp.status == "broken"
    assert run.detail["broken"] is True
    assert source.last_status == "http_404"


def test_successful_fetch_resets_broken_count(db_session, monkeypatch):
    source, opp = _source_with_opportunity(db_session)
    monkeypatch.setattr(scrape_pipeline, "fetch_page", lambda url: ("", 404))
    run_scrape_for_source(db_session, source)

    html = "<html><body>" + DAAD_TEXT.replace("\n", "<br>") + "</body></html>"
    monkeypatch.setattr(scrape_pipeline, "fetch_page", lambda url: (html, 200))
    run_scrape_for_source(db_session, source)
    db_session.refresh(opp)
    assert opp.broken_count == 0


def test_scrape_run_logged_for_robots_block(db_session, monkeypatch):
    source = Source(name="Blocked", base_url="https://blocked.example.edu")
    db_session.add(source)
    db_session.commit()

    def blocked(url):
        raise ScrapeBlocked("robots.txt disallows")

    monkeypatch.setattr(scrape_pipeline, "fetch_page", blocked)
    run = run_scrape_for_source(db_session, source)
    assert run.status == "failed" and run.failed_count == 1
    assert source.last_status == "blocked_by_robots"
    assert db_session.query(ScrapeRun).count() == 1


def test_scrape_run_counts_new_opportunity(db_session, monkeypatch):
    source = Source(name="DAAD", base_url="https://daad.de/prog")
    db_session.add(source)
    db_session.commit()
    html = "<html><body><p>" + DAAD_TEXT.replace("\n", "</p><p>") + "</p></body></html>"
    monkeypatch.setattr(scrape_pipeline, "fetch_page", lambda url: (html, 200))

    run = run_scrape_for_source(db_session, source)
    assert run.status == "ok"
    assert run.pages_fetched == 1 and run.new_count == 1
    assert run.finished_at is not None


class _FakeMessages:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        text = self.replies.pop(0)
        return type("Resp", (), {"content": [type("Block", (), {"text": text})()]})()


def _patch_anthropic(monkeypatch, replies):
    import anthropic

    messages = _FakeMessages(replies)
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kw: type("C", (), {"messages": messages})())
    return messages


VALID_LLM_JSON = json.dumps({
    "title": "DAAD Graduate School Scholarship Programme", "organization": "DAAD",
    "type": "scholarship", "degree_levels": ["masters", "phd"], "fields": ["Engineering"],
    "funding_type": "fully_funded", "funding_amount": "934 EUR/month", "location": "Germany",
    "is_remote": False, "open_to_uae_residents": None, "deadline": "2027-10-15",
    "deadline_text": "October 15, 2027",
    "eligibility": {"degree_levels": ["bachelors"], "min_year": None, "max_year": None,
                    "min_cgpa": {"value": 3.0, "scale": 4}, "nationality_allowed": ["any"],
                    "nationality_excluded": [], "residency_required": None,
                    "english_requirements": {}, "required_fields": [], "other_requirements": []},
    "description_summary": "Scholarships in Germany.", "confidence": {"deadline": 0.95},
    "overall_confidence": 0.9,
})


def test_llm_extraction_retries_once_after_invalid_json(monkeypatch):
    messages = _patch_anthropic(monkeypatch, ["not json at all", "```json\n" + VALID_LLM_JSON + "\n```"])
    data = extractor.extract_llm(DAAD_TEXT, "DAAD", "https://daad.de")
    assert messages.calls == 2
    assert data["deadline"] == "2027-10-15"
    assert data["overall_confidence"] == 0.9


def test_llm_extraction_invalid_twice_forces_review(monkeypatch):
    bad_schema = json.dumps({**json.loads(VALID_LLM_JSON), "type": "party"})
    messages = _patch_anthropic(monkeypatch, [bad_schema, bad_schema])
    data = extractor.extract_llm(DAAD_TEXT, "DAAD", "https://daad.de")
    assert messages.calls == 2
    assert data["overall_confidence"] == 0.0  # -> pending_review in ingest
    assert data["extraction_error"] == "llm_output_invalid"


def test_robots_txt_disallow_is_respected(monkeypatch):
    import httpx

    from app.services import scraper

    robots = "User-agent: *\nDisallow: /private/\n"
    transport = httpx.MockTransport(lambda req: httpx.Response(200, text=robots))
    real_client = httpx.Client
    monkeypatch.setattr(scraper.httpx, "Client", lambda **kw: real_client(transport=transport, **kw))

    assert scraper.check_robots_allowed("https://uni.example.edu/programs/") is True
    assert scraper.check_robots_allowed("https://uni.example.edu/private/x") is False


def test_render_relative_dates():
    from datetime import date

    from app.seed import render_relative_dates

    out = render_relative_dates("Deadline: {{today+5}} / {{today-10}}", today=date(2026, 9, 30))
    assert out == "Deadline: October 5, 2026 / September 20, 2026"
