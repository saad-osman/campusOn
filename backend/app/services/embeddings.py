"""Embeddings, stored as JSON float arrays in SQLite (no pgvector — see
README "Infra notes"). Cosine similarity is computed in Python/numpy, which
is plenty fast at this data scale (dozens to low hundreds of rows).

The model is all-MiniLM-L6-v2 run through fastembed (ONNX Runtime, no torch):
the same vectors as sentence-transformers at under half the memory, so the API
fits a 512 MB host. `python -m app.services.embeddings` downloads it ahead of time.
"""
import os
from pathlib import Path

import numpy as np

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
# Kept inside the project (not the OS temp dir) so a model fetched at build time is
# still there at runtime on hosts that only keep the project directory.
CACHE_DIR = os.environ.get("FASTEMBED_CACHE_PATH") or str(Path(__file__).resolve().parents[2] / ".fastembed_cache")

_model = None


def get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding

        _model = TextEmbedding(MODEL_NAME, cache_dir=CACHE_DIR)
    return _model


def embed_text(text: str) -> list[float]:
    vec = np.asarray(next(iter(get_model().embed([text]))), dtype=np.float32)
    norm = np.linalg.norm(vec)
    return (vec / norm if norm else vec).tolist()


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


if __name__ == "__main__":
    get_model()
    print(f"Embedding model ready in {CACHE_DIR}")
