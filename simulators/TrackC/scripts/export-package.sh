#!/usr/bin/env bash
# Create a portable zip of UNIQA Coach (no secrets, no node_modules, no large test output).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATE="$(date +%Y-%m-%d)"
DEFAULT_OUT="$HOME/Desktop/uniqa-coach-export-${DATE}.zip"
OUT="${1:-$DEFAULT_OUT}"
DIR_NAME="$(basename "$ROOT")"
PARENT="$(dirname "$ROOT")"

echo "▶ Exporting: $ROOT"
echo "  → $OUT"

cd "$PARENT"

zip -r "$OUT" "$DIR_NAME" \
  -x "$DIR_NAME/node_modules/*" \
  -x "$DIR_NAME/node_modules/**" \
  -x "$DIR_NAME/.env" \
  -x "$DIR_NAME/dist/*" \
  -x "$DIR_NAME/dist/**" \
  -x "$DIR_NAME/test-results/*" \
  -x "$DIR_NAME/test-results/**" \
  -x "$DIR_NAME/.DS_Store" \
  -x "$DIR_NAME/**/.DS_Store" \
  -x "$DIR_NAME/.git/*" \
  -x "$DIR_NAME/.git/**" \
  > /dev/null

BYTES="$(wc -c < "$OUT" | tr -d ' ')"
MB="$(echo "scale=1; $BYTES / 1048576" | bc)"

echo "✓ Created $(basename "$OUT") (${MB} MB)"
echo ""
echo "On the target machine:"
echo "  1. unzip $(basename "$OUT")"
echo "  2. cd \"$DIR_NAME\""
echo "  3. Follow SETUP.md"
