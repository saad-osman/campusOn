"""Feature 3: Professor & lab finder via the Semantic Scholar Graph API.

Searches recent papers for a research topic, groups them by author, and ranks
authors by relevance (search rank), recency and citations. Responses are cached
for 7 days. The public API rate-limits hard without a key, so requests back off
exponentially; if it stays unavailable and nothing is cached, a clearly
labelled offline sample (seed/cache/professors_sample.json) keeps the demo usable.
"""
import hashlib
import json
import logging
import math
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.api_cache import ApiCache
from app.services import llm
from app.services.rate_limit import check_rate_limit

logger = logging.getLogger("scholarradar.semantic_scholar")
settings = get_settings()

BASE = "https://api.semanticscholar.org/graph/v1"
CACHE_TTL = timedelta(days=7)
SAMPLE_PATH = Path(__file__).resolve().parents[2] / "seed" / "cache" / "professors_sample.json"
# Real results for common searches (python -m app.snapshot_professors), loaded by the seed.
SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / "seed" / "cache" / "professors_snapshot.json"
PAPER_FIELDS = "title,year,url,venue,citationCount,authors,s2FieldsOfStudy,publicationDate"
AUTHOR_FIELDS = "name,affiliations,hIndex,citationCount,paperCount,url"

BITS_MARKERS = ["bits pilani", "birla institute of technology and science", "bits dubai", "bits, pilani"]
UAE_MARKERS = [
    "uae", "united arab emirates", "abu dhabi", "dubai", "sharjah", "al ain", "ajman", "ras al khaimah",
    "khalifa university", "mbzuai", "mohamed bin zayed", "nyu abu dhabi", "new york university abu dhabi",
    "american university of sharjah", "university of sharjah", "zayed university", "masdar",
    "uae university", "united arab emirates university", "heriot-watt university dubai",
    "university of wollongong in dubai", "rochester institute of technology dubai",
]


class ScholarUnavailable(Exception):
    pass


def highlight_for(affiliations: list[str]) -> str | None:
    text = " | ".join(affiliations or []).lower()
    if any(m in text for m in BITS_MARKERS):
        return "BITS Pilani"
    if any(m in text for m in UAE_MARKERS):
        return "UAE"
    return None


def _get(client: httpx.Client, method: str, url: str, **kwargs) -> dict:
    headers = {"User-Agent": f"ScholarRadarBot/1.0 (+mailto:{settings.SCRAPER_CONTACT_EMAIL})"}
    if settings.SEMANTIC_SCHOLAR_API_KEY:
        headers["x-api-key"] = settings.SEMANTIC_SCHOLAR_API_KEY
    delay = 1.0
    for attempt in range(4):
        try:
            resp = client.request(method, url, headers=headers, timeout=15.0, **kwargs)
        except httpx.HTTPError as e:
            logger.info("Semantic Scholar network error: %s", e)
            resp = None
        if resp is not None and resp.status_code == 200:
            return resp.json()
        if resp is not None and resp.status_code not in (429, 500, 502, 503, 504):
            raise ScholarUnavailable(f"HTTP {resp.status_code}")
        if attempt < 3:
            time.sleep(delay)
            delay *= 2
    raise ScholarUnavailable("rate limited or unreachable")


def _rank_authors(papers: list[dict], query: str) -> list[dict]:
    this_year = date.today().year
    by_author: dict[str, dict] = {}
    papers_by_author: dict[str, list[tuple[float, dict]]] = defaultdict(list)
    for rank, paper in enumerate(papers):
        relevance = 1.0 / (1 + rank / 8)
        year = paper.get("year") or this_year - 6
        recency = max(0.2, 1 - (this_year - year) / 8)
        citations = paper.get("citationCount") or 0
        weight = relevance * recency + 0.08 * math.log1p(citations)
        for author in (paper.get("authors") or [])[:6]:
            aid = author.get("authorId")
            if not aid:
                continue
            entry = by_author.setdefault(aid, {"author_id": aid, "name": author.get("name"), "score": 0.0, "topics": defaultdict(float)})
            entry["score"] += weight
            for f in paper.get("s2FieldsOfStudy") or []:
                if f.get("category"):
                    entry["topics"][f["category"]] += weight
            papers_by_author[aid].append((weight, paper))
    ranked = sorted(by_author.values(), key=lambda a: a["score"], reverse=True)
    out = []
    for a in ranked[:15]:
        top_papers = sorted(papers_by_author[a["author_id"]], key=lambda wp: (wp[1].get("year") or 0, wp[0]), reverse=True)[:3]
        out.append({
            "author_id": a["author_id"],
            "name": a["name"],
            "score": round(a["score"], 3),
            "topics": [t for t, _ in sorted(a["topics"].items(), key=lambda kv: kv[1], reverse=True)[:3]],
            "recent_papers": [
                {
                    "title": p.get("title"), "year": p.get("year"), "venue": p.get("venue") or None,
                    "url": p.get("url"), "citations": p.get("citationCount") or 0,
                }
                for _, p in top_papers
            ],
        })
    return out


def fetch_live(query: str) -> list[dict]:
    with httpx.Client() as client:
        data = _get(client, "GET", f"{BASE}/paper/search", params={
            "query": query, "limit": 60, "fields": PAPER_FIELDS, "year": f"{date.today().year - 5}-",
        })
        authors = _rank_authors(data.get("data") or [], query)
        if not authors:
            return []
        details = _get(client, "POST", f"{BASE}/author/batch", params={"fields": AUTHOR_FIELDS},
                       json={"ids": [a["author_id"] for a in authors]})
    detail_by_id = {d["authorId"]: d for d in details if d}
    for a in authors:
        d = detail_by_id.get(a["author_id"], {})
        a["affiliations"] = d.get("affiliations") or []
        a["h_index"] = d.get("hIndex")
        a["citation_count"] = d.get("citationCount")
        a["paper_count"] = d.get("paperCount")
        a["profile_url"] = d.get("url") or f"https://www.semanticscholar.org/author/{a['author_id']}"
        a["highlight"] = highlight_for(a["affiliations"])
    # Highlighted (BITS / UAE) researchers float up within the top results.
    authors.sort(key=lambda a: a["score"] * (1.35 if a["highlight"] else 1.0), reverse=True)
    return authors[:10]


def _sample(query: str) -> list[dict]:
    data = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    words = {w for w in query.lower().replace("/", " ").split() if len(w) > 2}

    def overlap(a):
        text = " ".join(a["topics"] + [p["title"] for p in a["recent_papers"]]).lower()
        return sum(1 for w in words if w in text)

    authors = sorted(data["authors"], key=lambda a: (overlap(a), a.get("highlight") is not None), reverse=True)
    return [dict(a, score=float(overlap(a))) for a in authors[:8]]


def cache_key(query: str) -> str:
    return hashlib.sha256(f"s2:{' '.join(query.split())[:200].lower()}".encode()).hexdigest()


def load_snapshot(db: Session) -> int:
    """Puts the real-results snapshot into the API cache, keeping each entry's fetch time.

    Fresh entries answer directly; older ones are tried live first and still beat the
    fictional sample if Semantic Scholar is rate-limited ("stale beats nothing" below).
    """
    if not SNAPSHOT_PATH.exists():
        return 0
    data = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    count = 0
    for entry in data.get("entries", []):
        key = cache_key(entry["query"])
        fetched_at = datetime.fromisoformat(entry["fetched_at"])
        row = db.query(ApiCache).filter(ApiCache.key == key).first()
        if row:
            row.payload, row.fetched_at = {"authors": entry["authors"]}, fetched_at
        else:
            db.add(ApiCache(key=key, namespace="semantic_scholar", payload={"authors": entry["authors"]}, fetched_at=fetched_at))
        count += 1
    db.commit()
    return count


def find_professors(db: Session, query: str) -> dict:
    """Returns {"query", "source": live|cache|sample, "fetched_at", "authors": [...]}."""
    query = " ".join(query.split())[:200]
    key = cache_key(query)
    cached = db.query(ApiCache).filter(ApiCache.key == key).first()
    if cached and datetime.utcnow() - cached.fetched_at < CACHE_TTL:
        return {"query": query, "source": "cache", "fetched_at": cached.fetched_at, "authors": cached.payload["authors"]}
    try:
        authors = fetch_live(query)
        if cached:
            cached.payload, cached.fetched_at = {"authors": authors}, datetime.utcnow()
        else:
            db.add(ApiCache(key=key, namespace="semantic_scholar", payload={"authors": authors}))
        db.commit()
        return {"query": query, "source": "live", "fetched_at": datetime.utcnow(), "authors": authors}
    except ScholarUnavailable as e:
        logger.warning("Semantic Scholar unavailable for %r: %s", query, e)
        if cached:  # stale beats nothing
            return {"query": query, "source": "cache", "fetched_at": cached.fetched_at, "authors": cached.payload["authors"]}
        return {"query": query, "source": "sample", "fetched_at": None, "authors": _sample(query)}


# ---------- compare page: researchers without live Semantic Scholar calls ----------

COMPARE_AUTHORS = 3
LLM_NAMESPACE = "llm_professors"


class _SuggestedResearcher(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    affiliation: str | None = Field(default=None, max_length=300)
    topic: str | None = Field(default=None, max_length=200)


class _Suggestions(BaseModel):
    researchers: list[_SuggestedResearcher] = Field(default_factory=list, max_length=10)


def llm_cache_key(query: str) -> str:
    return hashlib.sha256(f"llm_prof:{' '.join(query.split())[:200].lower()}".encode()).hexdigest()


def _compact(authors: list[dict]) -> list[dict]:
    """Semantic Scholar-shaped authors (snapshot, cache, sample) -> the compare page's short form."""
    return [
        {
            "name": a.get("name") or "Unknown researcher",
            "affiliation": (a.get("affiliations") or [None])[0],
            "topic": (a.get("topics") or [None])[0],
            "profile_url": a.get("profile_url"),
        }
        for a in authors[:COMPARE_AUTHORS]
    ]


def _ask_llm(query: str, opp) -> list[dict] | None:
    """Up to 3 researchers from the LLM, or None if it failed (bad output twice, or unavailable)."""
    facts = [f"Search topic: {query}"]
    if opp is not None:
        facts += [f"Opportunity: {opp.title}", f"Institution: {opp.organization}"]
        if opp.fields:
            facts.append("Fields: " + ", ".join(opp.fields))
        if opp.location:
            facts.append(f"Location: {opp.location}")
    system = llm.load_prompt("professor_suggestions.md")
    for _attempt in range(2):  # retry once on output that doesn't validate, like the extractor
        try:
            data = llm.complete_json(system, "\n".join(facts), max_tokens=800)
        except llm.LLMUnavailable as e:  # complete_json already retried bad JSON once
            logger.info("LLM professor suggestions unavailable for %r: %s", query, e)
            return None
        try:
            parsed = _Suggestions.model_validate(data)
        except ValidationError:
            continue
        return [
            {"name": r.name, "affiliation": r.affiliation, "topic": r.topic, "profile_url": None}
            for r in parsed.researchers[:COMPARE_AUTHORS]
        ]
    return None


def find_professors_offline(db: Session, query: str, user, opp=None) -> dict:
    """Researchers for the compare page, without ever calling Semantic Scholar live.

    Order: saved Semantic Scholar results (snapshot/cache, any age) -> cached AI
    suggestions (7 days) -> ask the LLM (rate-limited per user) -> the fictional sample.
    Returns {"query", "source": cache|ai|sample, "fetched_at", "authors": [compact]}.
    """
    query = " ".join(query.split())[:200]

    cached = db.query(ApiCache).filter(ApiCache.key == cache_key(query)).first()
    if cached and cached.payload.get("authors"):
        return {"query": query, "source": "cache", "fetched_at": cached.fetched_at,
                "authors": _compact(cached.payload["authors"])}

    key = llm_cache_key(query)
    ai_cached = db.query(ApiCache).filter(ApiCache.key == key).first()
    if ai_cached and datetime.utcnow() - ai_cached.fetched_at < CACHE_TTL:
        return {"query": query, "source": "ai", "fetched_at": ai_cached.fetched_at,
                "authors": ai_cached.payload.get("authors", [])}

    if llm.llm_enabled() and check_rate_limit(f"prof-ai:{user.id}", max_calls=8, window_seconds=60):
        authors = _ask_llm(query, opp)
        if authors is not None:
            now = datetime.utcnow()
            if ai_cached:
                ai_cached.payload, ai_cached.fetched_at = {"authors": authors}, now
            else:
                db.add(ApiCache(key=key, namespace=LLM_NAMESPACE, payload={"authors": authors}, fetched_at=now))
            db.commit()
            return {"query": query, "source": "ai", "fetched_at": now, "authors": authors}

    return {"query": query, "source": "sample", "fetched_at": None, "authors": _compact(_sample(query))}
