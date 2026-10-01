"""Builds the opportunity payloads the API returns: the row itself plus linked
sources (Feature 7), regions (Feature 11), the viewer's eligibility verdict
(Feature 1) and match score (Feature 2), endorsements (Feature 12), and
saved state. Lookups are batched so a list of N cards costs a handful of queries.
"""
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.opportunity import Opportunity, OpportunitySource, SavedOpportunity
from app.models.profile import Profile
from app.models.source import Source
from app.models.user import User
from app.schemas.search import SearchFilters
from app.services.eligibility import check_eligibility
from app.services.embeddings import cosine_similarity, embed_text
from app.services.fields import match_field_deterministic
from app.services.matcher import profile_embedding_text, profile_to_dict, score_opportunity

STAFF_ROLES = ("faculty", "admin")
STUDENT_VISIBLE_STATUSES = {"active", "expired"}
FUNDED_TYPES = {"fully_funded", "stipend", "partial"}


def visible_to(user: User | None, opp: Opportunity) -> bool:
    # Broken links are hidden from students and unreviewed extractions aren't
    # shown until faculty approve them (Feature 6); staff see everything.
    return bool(user and user.role in STAFF_ROLES) or opp.status in STUDENT_VISIBLE_STATUSES


def get_profile(db: Session, user: User | None) -> Profile | None:
    if not user:
        return None
    return db.query(Profile).filter(Profile.user_id == user.id).first()


def ensure_profile_embedding(db: Session, profile: Profile | None) -> list[float] | None:
    """Profile embeddings are recomputed on profile edits; this backfills ones
    that were never computed (e.g. a profile created before Phase 4)."""
    if profile is None:
        return None
    if profile.embedding:
        return profile.embedding
    text = profile_embedding_text(profile)
    if not text.strip():
        return None
    profile.embedding = embed_text(text)
    db.commit()
    return profile.embedding


def refresh_profile_embedding(profile: Profile) -> None:
    text = profile_embedding_text(profile)
    profile.embedding = embed_text(text) if text.strip() else None


def _sources_by_canonical(db: Session, opp_ids: list[str]) -> dict[str, list[dict]]:
    if not opp_ids:
        return {}
    dupes = db.query(Opportunity.id, Opportunity.canonical_id).filter(Opportunity.canonical_id.in_(opp_ids)).all()
    owner = {oid: oid for oid in opp_ids}
    owner.update({dupe_id: canon for dupe_id, canon in dupes})
    rows = (
        db.query(OpportunitySource, Source)
        .join(Source, Source.id == OpportunitySource.source_id)
        .filter(OpportunitySource.opportunity_id.in_(list(owner)))
        .all()
    )
    out: dict[str, list[dict]] = defaultdict(list)
    for link, src in rows:
        entry = {"name": src.name, "url": link.url, "region": src.region}
        bucket = out[owner[link.opportunity_id]]
        if entry not in bucket:
            bucket.append(entry)
    return out


def _endorsements_by_opp(db: Session, opp_ids: list[str]) -> dict[str, list[dict]]:
    try:
        from app.models.endorsement import Endorsement
    except ImportError:  # endorsements land in Phase 6
        return {}
    if not opp_ids:
        return {}
    rows = (
        db.query(Endorsement, User)
        .join(User, User.id == Endorsement.faculty_id)
        .filter(Endorsement.opportunity_id.in_(opp_ids))
        .order_by(Endorsement.created_at.desc())
        .all()
    )
    out: dict[str, list[dict]] = defaultdict(list)
    for e, faculty in rows:
        out[e.opportunity_id].append({
            "id": e.id, "faculty_name": faculty.name, "note": e.note,
            "target_degree_level": e.target_degree_level, "target_year": e.target_year,
            "target_major": e.target_major, "created_at": e.created_at,
        })
    return out


def endorsement_applies(endorsement: dict, profile: dict) -> bool:
    if endorsement.get("target_degree_level") and profile.get("degree_level") != endorsement["target_degree_level"]:
        return False
    if endorsement.get("target_year") and profile.get("year_of_study") != endorsement["target_year"]:
        return False
    if endorsement.get("target_major"):
        terms = [profile.get("major") or ""] + (profile.get("interests") or [])
        if not match_field_deterministic(endorsement["target_major"], [t for t in terms if t]):
            return False
    return True


def build_payloads(db: Session, opps: list[Opportunity], user: User | None, *,
                   allow_llm_fields: bool = False) -> list[dict]:
    from app.schemas.opportunity import OpportunityOut

    ids = [o.id for o in opps]
    sources = _sources_by_canonical(db, ids)
    endorsements = _endorsements_by_opp(db, ids)
    saved_ids: set[str] = set()
    if user and ids:
        saved_ids = {
            r.opportunity_id for r in db.query(SavedOpportunity.opportunity_id)
            .filter(SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id.in_(ids)).all()
        }

    profile = get_profile(db, user)
    profile_dict = profile_to_dict(profile)
    has_profile = bool(profile and (profile.degree_level or profile.major or profile.interests))
    profile_vec = ensure_profile_embedding(db, profile) if has_profile else None

    out = []
    for opp in opps:
        data = OpportunityOut.model_validate(opp).model_dump()
        data["sources"] = sources.get(opp.id, [])
        data["source_count"] = max(1, len(data["sources"]))
        data["regions"] = sorted({s["region"] for s in data["sources"]})
        data["saved"] = opp.id in saved_ids
        data["endorsements"] = endorsements.get(opp.id, [])
        if has_profile:
            elig = check_eligibility(profile_dict, opp.eligibility, degree_levels=opp.degree_levels,
                                     allow_llm_fields=allow_llm_fields)
            relevant = [e for e in data["endorsements"] if endorsement_applies(e, profile_dict)]
            data["eligibility_check"] = elig.to_dict()
            data["match"] = score_opportunity(
                profile_dict, profile_vec, opp, eligibility=elig,
                endorsed_by=relevant[0]["faculty_name"] if relevant else None,
            )
        out.append(data)
    return out


def apply_filters(payloads: list[dict], f: SearchFilters, today: date | None = None) -> list[dict]:
    today = today or date.today()
    out = []
    for p in payloads:
        if not f.include_expired and p["status"] == "expired":
            continue
        if f.degree_level:
            levels = p["degree_levels"] or []
            if levels and "any" not in levels and f.degree_level not in levels:
                continue
        if f.year:
            elig = p["eligibility"] or {}
            if (elig.get("min_year") and f.year < elig["min_year"]) or (elig.get("max_year") and f.year > elig["max_year"]):
                continue
        if f.fields:
            opp_fields = p["fields"] or []
            if not any(match_field_deterministic(want, opp_fields) for want in f.fields):
                continue
        if f.funding == "funded" and p["funding_type"] not in FUNDED_TYPES:
            continue
        if f.funding == "fully_funded" and p["funding_type"] != "fully_funded":
            continue
        if f.regions:
            if not set(f.regions) & set(p["regions"]):
                continue
        if f.types and p["type"] not in f.types:
            continue
        if f.deadline_within_days:
            dl = p["deadline"]
            if not dl or dl < today or dl > today + timedelta(days=f.deadline_within_days):
                continue
        if f.remote_only and not p["is_remote"]:
            continue
        if f.open_to_uae_residents and p["open_to_uae_residents"] is not True:
            continue
        if f.verified_only and not p["verified"]:
            continue
        if f.eligible_only and (p.get("eligibility_check") or {}).get("verdict") not in ("eligible", "partially_eligible"):
            continue
        out.append(p)
    return out


def rank(payloads: list[dict], opps_by_id: dict[str, Opportunity], semantic_query: str | None,
         sort: str = "match") -> list[dict]:
    if sort == "deadline":
        far = date.max
        return sorted(payloads, key=lambda p: (p["deadline"] is None, p["deadline"] or far))
    if sort == "newest":
        return sorted(payloads, key=lambda p: p["first_seen"], reverse=True)

    query_vec = embed_text(semantic_query) if semantic_query else None
    for p in payloads:
        match = (p.get("match") or {}).get("score", 50) / 100
        if query_vec:
            sim = cosine_similarity(query_vec, opps_by_id[p["id"]].embedding)
            p["relevance"] = round(sim, 3)
            p["_rank"] = 0.6 * sim + 0.4 * match
        else:
            p["_rank"] = match
        if (p.get("eligibility_check") or {}).get("verdict") == "not_eligible":
            p["_rank"] *= 0.8  # still listed (with the reason), just below ones they can apply to
    payloads.sort(key=lambda p: p["_rank"], reverse=True)
    for p in payloads:
        p.pop("_rank", None)
    return payloads
