#!/usr/bin/env bash
# Safe wrapper around `prisma migrate reset` for the TEST database ONLY.
#
# Why this exists: `prisma migrate reset` uses the datasource's `directUrl`
# (env DIRECT_URL), NOT `url` (env DATABASE_URL). The old one-liner only
# overrode DATABASE_URL, so reset ran against whatever DIRECT_URL pointed at —
# which wiped the live Supabase DB on 2026-05-27. This wrapper overrides BOTH
# urls and refuses to run unless the host is unambiguously local.
set -euo pipefail

URL="${TEST_DATABASE_URL:-postgresql://hakalive:hakalive@localhost:5433/hakalive_test}"

host="$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$URL")"
case "$host" in
  localhost|127.0.0.1|::1|db|postgres) ;;
  *)
    echo "REFUSING test:db:reset — TEST_DATABASE_URL host '$host' is not local." >&2
    echo "migrate reset is destructive; it will only run against localhost/127.0.0.1/::1/db." >&2
    echo "Set TEST_DATABASE_URL to a local Postgres before running." >&2
    exit 1
    ;;
esac

dbName="$(node -e 'process.stdout.write(new URL(process.argv[1]).pathname.replace(/^\\//, ""))' "$URL")"
if [[ "$dbName" != *test* ]]; then
  echo "REFUSING test:db:reset — database name '$dbName' does not look like a test DB." >&2
  echo "Set TEST_DATABASE_URL to a DB containing 'test' in its name (e.g. hakalive_test)." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "REFUSING test:db:reset — pg_dump is not installed (needed to backup before reset)." >&2
  exit 1
fi

backupDir="${TEST_DB_BACKUP_DIR:-/tmp/hakalive-test-db-backups}"
mkdir -p "$backupDir"
backupFile="$backupDir/${dbName}_$(date -u +%Y%m%dT%H%M%SZ).dump"

pgHost="$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$URL")"
pgPort="$(node -e 'process.stdout.write(String(new URL(process.argv[1]).port || 5432))' "$URL")"
pgUser="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.argv[1]).username || ""))' "$URL")"
pgPass="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.argv[1]).password || ""))' "$URL")"

echo "Backing up TEST database '$dbName' to '$backupFile'..."
PGHOST="$pgHost" PGPORT="$pgPort" PGUSER="$pgUser" PGPASSWORD="$pgPass" \
  pg_dump --format=custom --no-owner --no-privileges --file "$backupFile" "$dbName"

echo "Resetting TEST database at host '$host' (DATABASE_URL and DIRECT_URL both pinned to TEST_DATABASE_URL)..."
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate reset --force

echo
echo "Backup created at: $backupFile"
echo "To restore later (WARNING: overwrites data), run:"
echo "  pg_restore --clean --if-exists --no-owner --dbname \"$URL\" \"$backupFile\""
