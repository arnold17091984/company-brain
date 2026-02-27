.PHONY: setup dev test clean lint db-migrate db-seed

setup: ## Initial setup - copy env, start services, install deps
	@test -f .env || cp .env.example .env
	docker compose up -d
	cd apps/api && uv sync
	cd apps/web && npm install
	cd apps/bot && uv sync
	@echo "\n✓ Setup complete. Run 'make dev' to start development."

dev: ## Start all development servers
	docker compose up -d
	npx turbo dev

test: ## Run all tests
	npx turbo test

lint: ## Run all linters
	npx turbo lint

clean: ## Stop services and remove volumes
	docker compose down -v
	@echo "✓ Cleaned up."

db-migrate: ## Run database migrations
	cd apps/api && uv run alembic upgrade head

db-seed: ## Seed database with test data
	cd infra/scripts && bash seed.sh

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
