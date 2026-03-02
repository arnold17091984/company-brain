# ============================================================
# Company Brain - Developer Makefile
#
# DATABASE NOTE: postgres runs on host port 5434 (not 5432).
# Ensure DATABASE_URL in .env uses port 5434.
# Example: postgresql+asyncpg://dev:dev@localhost:5434/company_brain
# ============================================================

.PHONY: help setup setup-full dev test lint check clean \
        db-migrate db-seed db-reset \
        docker-logs docker-status observability

.DEFAULT_GOAL := help

# ── Help ──────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Setup ─────────────────────────────────────────────────────────────────────

setup: ## Initial setup - copy env, start services, install deps
	@test -f .env || cp .env.example .env
	docker compose up -d
	@echo "Waiting for services to be healthy..."
	@until docker compose ps --format json | python3 -c "import sys,json; data=sys.stdin.read(); services=[json.loads(l) for l in data.strip().splitlines() if l]; unhealthy=[s['Name'] for s in services if s.get('Health','') not in ('healthy','')]; exit(1 if unhealthy else 0)" 2>/dev/null; do \
		echo "  Services not ready yet, retrying in 3s..."; \
		sleep 3; \
	done
	@echo "All services healthy."
	cd apps/api && uv sync
	cd apps/web && npm install
	cd apps/bot && uv sync
	@echo "\nSetup complete. Run 'make dev' to start development."

setup-full: setup db-migrate db-seed ## Full setup including migrations and seed data

# ── Development ───────────────────────────────────────────────────────────────

dev: ## Start all development servers (infrastructure + app servers)
	docker compose up -d
	npx turbo dev

observability: ## Start services with Langfuse observability stack
	docker compose --profile observability up -d

# ── Quality ───────────────────────────────────────────────────────────────────

lint: ## Run all linters (Python + TypeScript)
	npx turbo lint

test: ## Run all tests
	npx turbo test

check: ## Run lint, tests, and typecheck in sequence
	npx turbo lint
	npx turbo typecheck
	npx turbo test

# ── Database ──────────────────────────────────────────────────────────────────

db-migrate: ## Run Alembic database migrations
	cd apps/api && uv run alembic upgrade head

db-seed: ## Seed database with development data
	bash infra/scripts/seed.sh

db-reset: ## Drop and recreate the database, then migrate and seed
	@echo "Resetting database..."
	docker compose exec postgres psql -U dev -c "DROP DATABASE IF EXISTS company_brain;"
	docker compose exec postgres psql -U dev -c "CREATE DATABASE company_brain;"
	$(MAKE) db-migrate
	$(MAKE) db-seed
	@echo "Database reset complete."

# ── Docker ────────────────────────────────────────────────────────────────────

docker-logs: ## Tail docker compose service logs
	docker compose logs -f

docker-status: ## Show docker compose service status with health
	docker compose ps

clean: ## Stop all services and remove volumes
	docker compose down -v
	@echo "Cleaned up."
