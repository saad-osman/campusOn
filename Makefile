SHELL := /bin/bash
ROOT := $(shell pwd)
NODE_BIN := $(ROOT)/.node/bin
export PATH := $(NODE_BIN):$(PATH)

# Windows (Git Bash) venvs put executables in Scripts/, everywhere else in bin/.
ifeq ($(OS),Windows_NT)
  PYTHON ?= python
  VENV_BIN := .venv/Scripts
else
  PYTHON ?= python3
  VENV_BIN := .venv/bin
endif

.PHONY: setup migrate seed dev dev-backend dev-frontend test build clean

setup:
	@echo "== Backend: venv + deps =="
	cd backend && $(PYTHON) -m venv .venv
	cd backend && $(VENV_BIN)/python -m pip install --quiet --upgrade pip && $(VENV_BIN)/python -m pip install --quiet -r requirements.txt
	@if [ ! -f backend/.env ]; then 		sed "s/^SECRET_KEY=.*/SECRET_KEY=$$(cd backend && $(VENV_BIN)/python -c 'import secrets; print(secrets.token_urlsafe(48))')/" .env.example > backend/.env; 		echo "created backend/.env from .env.example with a random SECRET_KEY (edit as needed)"; fi
	@echo "== Frontend: npm install =="
	cd frontend && npm install
	@if [ ! -f frontend/.env.local ]; then echo "BACKEND_URL=http://localhost:8000" > frontend/.env.local; fi
	@echo "Setup complete. Run 'make migrate && make seed && make dev' next."

migrate:
	cd backend && $(VENV_BIN)/alembic upgrade head

seed:
	cd backend && $(VENV_BIN)/python -m app.seed

test:
	cd backend && $(VENV_BIN)/python -m pytest -q

dev-backend:
	cd backend && $(VENV_BIN)/uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "Starting backend (:8000) and frontend (:3000). Ctrl+C stops both."
	@trap 'kill 0' EXIT; \
	($(MAKE) dev-backend) & \
	($(MAKE) dev-frontend) & \
	wait

build:
	cd frontend && npx next lint && npx next build

clean:
	rm -rf backend/.venv frontend/node_modules frontend/.next backend/scholarradar.db
