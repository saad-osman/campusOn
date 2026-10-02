#!/bin/sh
# Production entrypoint (Render; see render.yaml). The build step already seeds the demo
# database, so a fresh instance starts with data; this re-seeds only if it is empty.
set -e
mkdir -p data/uploads

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
