#!/usr/bin/env bash
set -euo pipefail
# Applies Public API M1 migration manually.
# Required env var: DATABASE_URL
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="$ROOT_DIR/drizzle/006_public_api_keys.sql"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi
if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "ERROR: migration file not found: $MIGRATION_FILE"
  exit 1
fi
echo "Applying migration: $MIGRATION_FILE"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_FILE"
echo "Done."
