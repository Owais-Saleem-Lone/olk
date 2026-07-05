#!/usr/bin/env bash
# Copies data (not schema) from the linked remote Supabase project into the
# local Docker database, so local dev has real content to work against
# instead of an empty database. Local-only tables the migrations already
# seed (areas, genres, notification_templates, platform_settings) may log
# "duplicate key" errors below if their content already matches — that's
# expected and harmless, not a sign anything failed to copy.
set -euo pipefail

cd "$(dirname "$0")/.."

DUMP_FILE="supabase/.temp/remote_data.sql"

echo "Dumping data from the linked remote project..."
npx supabase db dump --data-only --linked --schema public,auth -f "$DUMP_FILE"

echo "Loading it into the local database..."
npx supabase db query --local -f "$DUMP_FILE"

echo "Done. Local Docker Supabase now mirrors remote's data."
