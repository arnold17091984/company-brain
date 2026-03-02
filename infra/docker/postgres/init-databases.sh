#!/bin/bash
set -e

# Create additional databases needed by services.
# This runs automatically on first postgres container start.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE langfuse;
    GRANT ALL PRIVILEGES ON DATABASE langfuse TO dev;
EOSQL
