#!/usr/bin/env bash
set -euo pipefail

# Seed script for local development
# Usage: bash infra/scripts/seed.sh

DB_URL="${DATABASE_URL:-postgresql://dev:dev@localhost:5432/company_brain}"

echo "Seeding database at ${DB_URL}..."

psql "$DB_URL" <<'SQL'
-- Insert test departments
INSERT INTO departments (id, name, slug) VALUES
  (gen_random_uuid(), 'Engineering', 'engineering'),
  (gen_random_uuid(), 'Product', 'product'),
  (gen_random_uuid(), 'QA', 'qa'),
  (gen_random_uuid(), 'Business Development', 'bd'),
  (gen_random_uuid(), 'HR & Admin', 'hr-admin'),
  (gen_random_uuid(), 'Management', 'management')
ON CONFLICT (slug) DO NOTHING;

SELECT 'Seeded ' || count(*) || ' departments' FROM departments;
SQL

echo "✓ Seed complete."
