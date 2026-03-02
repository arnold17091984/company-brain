#!/usr/bin/env bash
set -euo pipefail

# Seed script for local development.
# Delegates to the idempotent Python seed module which uses SQLAlchemy async.
#
# Usage:
#   bash infra/scripts/seed.sh
#
# The script assumes it is executed from the repository root and that
# `uv` is available in PATH (installed via `make setup`).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="${REPO_ROOT}/apps/api"

echo "Running database seed via Python (${API_DIR})..."
cd "${API_DIR}"
uv run python -m app.scripts.seed
echo "Seed complete."
