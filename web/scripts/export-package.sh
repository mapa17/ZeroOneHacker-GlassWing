#!/usr/bin/env bash
# Create a portable zip of UNIQA Coach (no secrets, no node_modules, no large test output).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATE="$(date +%Y-%m-%d)"
DEFAULT_OUT="$HOME/Desktop/uniqa-coach-export-${DATE}.zip"
OUT="${1:-$DEFAULT_OUT}"
DIR_NAME="$(basename "$ROOT")"
PARENT="$(dirname "$ROOT")"

# Ensure output directory exists
mkdir -p "$(dirname "$OUT")"

echo "▶ Exporting: $ROOT"
echo "  → $OUT"

if [ -d "$ROOT/.git" ] && command -v git >/dev/null 2>&1; then
  echo "✓ Git repository detected. Using 'git archive' for a clean, ignore-faithful export..."
  cd "$ROOT"
  git archive --format=zip --prefix="$DIR_NAME/" -o "$OUT" HEAD
else
  echo "ℹ Not a Git repo or 'git' command not found. Falling back to standard zip with strict exclusions..."
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
    -x "$DIR_NAME/**/__pycache__/*" \
    -x "$DIR_NAME/**/.pytest_cache/*" \
    -x "$DIR_NAME/**/sweep_*.json" \
    > /dev/null
fi

BYTES="$(wc -c < "$OUT" | tr -d ' ')"
SIZE_KB=$(( BYTES / 1024 ))
SIZE_MB_INT=$(( SIZE_KB / 1024 ))
SIZE_MB_DEC=$(( (SIZE_KB * 10 / 1024) % 10 ))
MB="${SIZE_MB_INT}.${SIZE_MB_DEC}"

echo "✓ Created $(basename "$OUT") (${MB} MB)"

# Warn if file is larger than 5 MB (5242880 bytes)
if [ "$BYTES" -gt 5242880 ]; then
  echo "⚠️  WARNING: Export size is ${MB} MB, which is over the recommended 5 MB limit!"
  echo "    Please verify if node_modules/ or build caches were accidentally included."
fi

echo ""
echo "On the target machine:"
echo "  1. unzip $(basename "$OUT")"
echo "  2. cd \"$DIR_NAME\""
echo "  3. Follow SETUP.md"
