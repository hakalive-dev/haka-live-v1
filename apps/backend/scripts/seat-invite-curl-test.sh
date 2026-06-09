#!/usr/bin/env bash
# Test mic seat invite delivery with one phone + curl.
#
# Setup:
#   - Phone logged in as INVITEE (app open, foreground).
#   - Export HOST_TOKEN (host or room admin JWT).
#   - Export INVITEE_ID, ROOM_ID, and optional SEAT_POSITION (default 2).
#
# Usage:
#   export API_BASE=http://localhost:3010   # host only — do NOT include /api/v1
#   export HOST_TOKEN=eyJ...
#   export INVITEE_ID=uuid-of-invitee       # user UUID, not Haka ID
#   export ROOM_ID=uuid-of-live-room
#   ./apps/backend/scripts/seat-invite-curl-test.sh
#
# Invitee UUID from Haka ID (dev):
#   curl -s -X POST "$API_BASE/api/v1/auth/dev-login-haka" \
#     -H "Content-Type: application/json" \
#     -d '{"hakaId":"500000015","password":"YOUR_PASSWORD"}' | jq -r '.data.user.id'

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3010}"
# Allow API_BASE=http://host:3010/api/v1 by mistake — script always appends /api/v1/...
API_BASE="${API_BASE%/}"
API_BASE="${API_BASE%/api/v1}"
HOST_TOKEN="${HOST_TOKEN:?Set HOST_TOKEN (host/admin access JWT)}"
INVITEE_ID="${INVITEE_ID:?Set INVITEE_ID (invitee user UUID)}"
ROOM_ID="${ROOM_ID:?Set ROOM_ID (live room UUID)}"
SEAT_POSITION="${SEAT_POSITION:-2}"

echo "=== 1. Invitee user socket presence (phone must be logged in as INVITEE) ==="
PRESENCE=$(curl -s "${API_BASE}/api/v1/users/${INVITEE_ID}/presence")
echo "$PRESENCE" | jq .
IS_ONLINE=$(echo "$PRESENCE" | jq -r '.data.isOnline // false')
if [[ "$IS_ONLINE" != "true" ]]; then
  echo "WARN: invitee isOnline is not true — SeatInviteModal needs user socket connected."
fi

echo ""
echo "=== 2. Room status and seats (host token) ==="
ROOM=$(curl -s "${API_BASE}/api/v1/rooms/${ROOM_ID}" -H "Authorization: Bearer ${HOST_TOKEN}")
echo "$ROOM" | jq '{ status: .data.status, seats: [.data.seats[] | {position, userId, isLocked}] }'
STATUS=$(echo "$ROOM" | jq -r '.data.status // empty')
if [[ "$STATUS" != "live" ]]; then
  echo "ERROR: room status is '${STATUS}', expected 'live'"
  exit 1
fi

echo ""
echo "=== 3. POST seat invite (curl as host; phone shows overlay as invitee) ==="
INVITE=$(curl -s -X POST "${API_BASE}/api/v1/rooms/${ROOM_ID}/seats/invite" \
  -H "Authorization: Bearer ${HOST_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"${INVITEE_ID}\",\"position\":${SEAT_POSITION}}")
echo "$INVITE" | jq .
SUCCESS=$(echo "$INVITE" | jq -r '.success // false')
if [[ "$SUCCESS" != "true" ]]; then
  echo "ERROR: invite request failed"
  exit 1
fi

echo ""
echo "OK: Invite sent. On the invitee device, expect SeatInviteModal within ~1s."
