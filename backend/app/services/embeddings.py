"""Embeddings, stored as JSON float arrays in SQLite (no pgvector — see
README "Infra notes"). Cosine similarity is computed in Python/numpy, which
is plenty fast at this data scale (dozens to low hundreds of rows).
"""
import numpy as np

_model = None


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def embed_text(text: str) -> list[float]:
    model = get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def embed_opportunity(opp: dict) -> list[float]:
    parts = [opp.get("title", ""), opp.get("organization", "")]
    parts += opp.get("fields", []) or []
    if opp.get("description_summary"):
        parts.append(opp["description_summary"])
    return embed_text(" | ".join(p for p in parts if p))


def cosine_similarity(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b:
        return 0.0
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)
