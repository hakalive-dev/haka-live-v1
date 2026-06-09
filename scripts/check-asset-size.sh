#!/usr/bin/env bash
# check-asset-size.sh — fail if any bundled image would crash Android Canvas.
#
# Usage:
#   check-asset-size.sh staged          # check files staged for commit (default)
#   check-asset-size.sh scan <dir>      # recursively check all images under <dir>
#
# Threshold: an image is rejected when its decoded bitmap (W * H * 4 bytes,
# ARGB_8888) would exceed 50 MB. Android Canvas crashes with bitmaps above
# ~100 MB; 50 MB gives a 2x safety margin and would have caught the
# 15113x7736 khalti.jpg that decoded to 467 MB.

set -uo pipefail

MAX_DECODED_BYTES=$((50 * 1024 * 1024))  # 50 MB
EXIT_CODE=0

stat_size() {
  if stat -c %s "$1" >/dev/null 2>&1; then
    stat -c %s "$1"
  else
    stat -f %z "$1"
  fi
}

check_file() {
  local f="$1"
  local info width="" height=""

  [[ -f "$f" ]] || return 0

  case "$f" in
    *.png|*.PNG)
      info=$(file -b "$f")
      # file output: "PNG image data, 1290 x 1074, 8-bit/color RGBA, non-interlaced"
      # Anchor to "PNG image data, " so we don't match any later "N x N" in the line.
      if [[ "$info" =~ PNG\ image\ data,\ ([0-9]+)\ x\ ([0-9]+) ]]; then
        width=${BASH_REMATCH[1]}; height=${BASH_REMATCH[2]}
      fi
      ;;
    *.jpg|*.JPG|*.jpeg|*.JPEG)
      info=$(file -b "$f")
      # file output: "JPEG image data, ..., density 72x72, ..., 15113x7736, components 3"
      # Anchor to ", components" because the JPEG dims always immediately precede
      # the components field. This avoids matching the EXIF "density NxN" field
      # that appears earlier in many JPEGs (including the original khalti.jpg).
      if [[ "$info" =~ ([0-9]+)x([0-9]+),\ components ]]; then
        width=${BASH_REMATCH[1]}; height=${BASH_REMATCH[2]}
      fi
      ;;
    *.webp|*.WEBP)
      # `file` doesn't reliably expose WebP dimensions across versions.
      # Fall back to a file-size heuristic: any WebP > 1 MB is worth a manual look.
      local fsize
      fsize=$(stat_size "$f")
      if [[ ${fsize:-0} -gt $((1024 * 1024)) ]]; then
        echo "WARN: $f is a WebP > 1 MB on disk — manually verify dimensions are sane." >&2
      fi
      return 0
      ;;
    *) return 0;;
  esac

  if [[ -z "$width" || -z "$height" ]]; then
    echo "WARN: could not parse dimensions of $f (file says: $info)" >&2
    return 0
  fi

  local decoded=$((width * height * 4))
  if [[ $decoded -gt $MAX_DECODED_BYTES ]]; then
    local decoded_mb=$((decoded / 1024 / 1024))
    local limit_mb=$((MAX_DECODED_BYTES / 1024 / 1024))
    echo "" >&2
    echo "FAIL: $f" >&2
    echo "      ${width}x${height}px -> ${decoded_mb} MB decoded bitmap (limit: ${limit_mb} MB)" >&2
    local ext="${f##*.}"
    local tmp="${f%.*}.tmp.${ext}"
    echo "      Fix: ffmpeg -y -i \"$f\" -vf 'scale=2048:-1' \"$tmp\" && mv \"$tmp\" \"$f\"" >&2
    EXIT_CODE=1
  fi
}

MODE="${1:-staged}"

case "$MODE" in
  staged)
    # Only check images that are staged for the upcoming commit.
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      check_file "$f"
    done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
    ;;
  scan)
    DIR="${2:-.}"
    if [[ ! -d "$DIR" ]]; then
      echo "ERROR: not a directory: $DIR" >&2
      exit 2
    fi
    while IFS= read -r f; do
      check_file "$f"
    done < <(find "$DIR" -type f \
              \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
              -not -path '*/node_modules/*' \
              -not -path '*/.git/*' \
              -not -path '*/android/build/*' \
              -not -path '*/ios/build/*' \
              -not -path '*/.expo/*' \
              2>/dev/null)
    ;;
  *)
    echo "usage: $0 staged | scan <dir>" >&2
    exit 2
    ;;
esac

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "" >&2
  echo "Android Canvas crashes with bitmaps above ~100 MB. Resize the file(s) above." >&2
  echo "(See apps/mobile/assets/payment-methods/providers/khalti.jpg history — it was 15113x7736 / 467 MB and force-closed the app on the Nepal withdrawal screen.)" >&2
fi

exit $EXIT_CODE
