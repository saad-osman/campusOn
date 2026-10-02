# UNVERIFIED: written without Docker available in the build environment.
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 PIP_NO_CACHE_DIR=1

COPY backend/requirements.txt .
# psycopg is the Postgres driver.
RUN pip install -r requirements.txt "psycopg[binary]"

COPY backend/ .
# Pre-download the embedding model so the first request doesn't stall.
RUN python -m app.services.embeddings
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
