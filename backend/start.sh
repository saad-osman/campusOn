#!/bin/sh
# Production entrypoint (Render; see render.yaml). The build step already seeds the demo
# database, so a fresh instance starts with data; this re-seeds only if it is empty.
set -e
mkdir -p data/uploads

# Memory limits for the 512 MB free plan (dashboard env vars still win):
# - glibc otherwise creates up to 8 malloc arenas per CPU for a threaded server, and
#   the memory they fragment is never handed back -- RSS creeps up until the OOM kill.
# - ONNX Runtime, OpenMP, OpenBLAS and tokenizers size thread pools from the host's CPU
#   count, which on shared hosts is the whole machine; each thread costs memory.
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-2}"
export EMBED_THREADS="${EMBED_THREADS:-1}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-1}"
export OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-1}"
export TOKENIZERS_PARALLELISM="${TOKENIZERS_PARALLELISM:-false}"

if python -m app.db_has_users; then
  alembic upgrade head
else
  # Rule-based extraction for the seed: deterministic demo data and no API calls.
  # The server below uses the configured LLM provider.
  echo "Empty database; seeding demo data..."
  DEMO_MODE=true python -m app.seed
fi

# One worker: the background scheduler runs in-process.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 --proxy-headers --forwarded-allow-ips="*"
