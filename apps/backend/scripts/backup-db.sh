#!/usr/bin/env bash
# Daily logical backup of the (Supabase) Postgres database via pg_dump.
#
# Writes a compressed custom-format dump to ./backups and rotates out dumps
# older than BACKUP_RETENTION_DAYS. Designed to run both by hand
# (`npm run backup:db`) and from cron (loads .env itself, uses absolute node).
#
# Connection is taken from, in order of preference:
#   BACKUP_DATABASE_URL  — set this to the Supabase *direct* (non-pooled) URL
#   DIRECT_URL           — falls back to Prisma's migration URL
#   DATABASE_URL         — last resort (may be the pooler; slower but works)
#
# Restore a dump with:
#   pg_restore --clean --if-exists --no-owner --dbname "<target-url>" <file>.dump
set -euo pipefail

scriptDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backendDir="$(cd "$scriptDir/.." && pwd)"
cd "$backendDir"

# Load .env so cron (which runs with a bare environment) sees the DB URL.
# Quote values containing special characters in .env to keep this safe.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

URL="${BACKUP_DATABASE_URL:-${DIRECT_URL:-${DATABASE_URL:-}}}"
if [[ -z "$URL" ]]; then
  echo "ERROR: no database URL. Set BACKUP_DATABASE_URL (or DIRECT_URL/DATABASE_URL) in apps/backend/.env" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump is not installed." >&2
  exit 1
fi

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
backupDir="${BACKUP_DIR:-$backendDir/backups}"
mkdir -p "$backupDir"

dbName="$(node -e 'process.stdout.write(new URL(process.argv[1]).pathname.replace(/^\//, "") || "postgres")' "$URL")"
pgHost="$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$URL")"
pgPort="$(node -e 'process.stdout.write(String(new URL(process.argv[1]).port || 5432))' "$URL")"
pgUser="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.argv[1]).username || ""))' "$URL")"
pgPass="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.argv[1]).password || ""))' "$URL")"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backupFile="$backupDir/${dbName}_${stamp}.dump"

echo "[$(date -u +%FT%TZ)] Backing up '$dbName' on '$pgHost' -> '$backupFile'..."
PGHOST="$pgHost" PGPORT="$pgPort" PGUSER="$pgUser" PGPASSWORD="$pgPass" \
  pg_dump --format=custom --no-owner --no-privileges --file "$backupFile" "$dbName"

echo "[$(date -u +%FT%TZ)] Backup complete ($(du -h "$backupFile" | cut -f1))."

# Rotation: drop dumps older than the retention window.
deleted="$(find "$backupDir" -maxdepth 1 -name '*.dump' -type f -mtime "+$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')"
echo "[$(date -u +%FT%TZ)] Rotation: removed ${deleted} dump(s) older than ${RETENTION_DAYS} day(s)."
echo "Current backups:"
ls -1t "$backupDir"/*.dump 2>/dev/null | head -20 || true
