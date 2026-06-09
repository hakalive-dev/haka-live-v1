#!/usr/bin/env bash
#
# Toggle the Haka Live global kill switch (maintenance mode).
# Super-admin only. Reversible: `off` always works (the admin API is allow-listed).
#
# Usage:
#   API_URL=https://api.haka.live \
#   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
#   ./maintenance.sh status
#   ./maintenance.sh on  "Back in 10 min" "deploying v2"
#   ./maintenance.sh off
#
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
ACTION="${1:-status}"
MESSAGE="${2:-}"
REASON="${3:-}"

need() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }
need curl; need jq

# 1. Log in → grab the admin access token.
TOKEN=$(curl -fsS -X POST "$API_URL/api/v1/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "${ADMIN_EMAIL:?set ADMIN_EMAIL}" --arg p "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}" \
        '{email:$e, password:$p}')" \
  | jq -r '.data.tokens.accessToken')

[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "login failed" >&2; exit 1; }

auth=(-H "Authorization: Bearer $TOKEN")
base="$API_URL/api/v1/admin/maintenance"

case "$ACTION" in
  status) curl -fsS "${auth[@]}" "$base" | jq . ;;
  on)
    curl -fsS -X POST "${auth[@]}" -H 'Content-Type: application/json' \
      -d "$(jq -n --arg m "$MESSAGE" --arg r "$REASON" '{message:$m, reason:$r}')" \
      "$base/enable" | jq . ;;
  off)
    curl -fsS -X POST "${auth[@]}" "$base/disable" | jq . ;;
  *) echo "usage: $0 {status|on [message] [reason]|off}" >&2; exit 1 ;;
esac
