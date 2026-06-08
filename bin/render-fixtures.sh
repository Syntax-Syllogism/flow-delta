#!/usr/bin/env bash
# Render every fixtures/diff/<name>/ pair to an HTML (+ diff.json) artifact for
# visual smoke review. Output lands in a single directory, one file per fixture,
# named after the fixture directory (not the flow's internal name) so they never
# collide and are easy to scan.
#
# Usage:
#   bin/render-fixtures.sh [OUT_DIR]
# Defaults OUT_DIR to ./flow-delta-out/fixtures.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIFF_DIR="$ROOT/fixtures/diff"
OUT_DIR="${1:-$ROOT/flow-delta-out/fixtures}"

if [[ ! -d "$DIFF_DIR" ]]; then
  echo "No fixtures/diff directory at $DIFF_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

rendered=0
for dir in "$DIFF_DIR"/*/; do
  name="$(basename "$dir")"
  before="$dir/before.flow-meta.xml"
  after="$dir/after.flow-meta.xml"
  if [[ ! -f "$before" || ! -f "$after" ]]; then
    echo "skip $name (missing before/after)" >&2
    continue
  fi
  # Per-fixture out dir so the CLI's flow-name-based file stem can't collide
  # across fixtures, then rename the artifacts to the fixture name.
  tmp="$OUT_DIR/.$name"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  npx tsx "$ROOT/src/cli.ts" --old "$before" --new "$after" --out "$tmp" --json
  mv "$tmp"/*.html "$OUT_DIR/$name.html"
  mv "$tmp"/*.diff.json "$OUT_DIR/$name.diff.json"
  rm -rf "$tmp"
  rendered=$((rendered + 1))
done

echo
echo "Rendered $rendered fixture(s) to: $OUT_DIR"
echo "Open them in a browser, e.g.:  xdg-open \"$OUT_DIR/noop_save.html\""
