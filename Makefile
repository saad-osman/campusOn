SHELL := /bin/bash
ROOT := $(shell pwd)
NODE_BIN := $(ROOT)/.node/bin
export PATH := $(NODE_BIN):$(PATH)

.PHONY: setup migrate seed dev dev-backend dev-frontend test clean

setup:
	@echo "== Backend: venv + deps =="
	cd backend && python3 -m venv .venv
	cd backend && . .venv/bin/activate && pip install --quiet --upgrade pip && pip install --quiet -r requirements.txt
	@if [ ! -f backend/.env ]; then cp .env.example backend/.env; echo "created backend/.env from .env.example (edit as needed)"; fi
	@echo "== Frontend: npm install =="
	cd frontend && npm install
	@if [ ! -f frontend/.env.local ]; then echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > frontend/.env.local; fi
	@echo "Setup complete. Run 'make migrate && make seed && make dev' next."

migrate:
	cd backend && . .venv/bin/activate && alembic upgrade head

seed:
	cd backend && . .venv/bin/activate && python -m app.seed

test:
	cd backend && . .venv/bin/activate && pytest -q

dev-backend:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "Starting backend (:8000) and frontend (:3000). Ctrl+C stops both."
	@trap 'kill 0' EXIT; \
	($(MAKE) dev-backend) & \
	($(MAKE) dev-frontend) & \
	wait

clean:
	rm -rf backend/.venv frontend/node_modules frontend/.next backend/scholarradar.db
