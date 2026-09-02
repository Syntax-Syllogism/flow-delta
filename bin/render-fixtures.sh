#!/usr/bin/env bash
# Render fixture pairs to HTML (+ diff.json) artifacts for visual smoke review.
#
# Usage:
#   bin/render-fixtures.sh [flow|flexipage|flexipage-template|all] [OUT_DIR]
#
# With no arguments, both product fixture sets are rendered to their default
# output directories. The legacy form `bin/render-fixtures.sh OUT_DIR` remains
# supported and renders Flow fixtures into that directory.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mode="all"
out_arg=""
if [[ $# -gt 0 ]]; then
  case "$1" in
    flow|flexipage|flexipage-template|all)
      mode="$1"
      shift
      ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      # Preserve the previous positional OUT_DIR form.
      mode="flow"
      out_arg="$1"
      shift
      ;;
  esac
fi

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [flow|flexipage|flexipage-template|all] [OUT_DIR]" >&2
  exit 2
fi
if [[ $# -eq 1 ]]; then
  out_arg="$1"
fi

render_fixture_set() {
  local product="$1"
  local fixture_dir="$2"
  local before_name="$3"
  local after_name="$4"
  local cli_entrypoint="$5"
  local out_dir="$6"

  if [[ ! -d "$fixture_dir" ]]; then
    echo "No fixture directory at $fixture_dir" >&2
    return 1
  fi

  mkdir -p "$out_dir"

  local rendered=0
  for dir in "$fixture_dir"/*/; do
    [[ -d "$dir" ]] || continue
    local name
    name="$(basename "$dir")"
    local before="$dir/$before_name"
    local after="$dir/$after_name"
    if [[ ! -f "$before" || ! -f "$after" ]]; then
      echo "skip $product/$name (missing before/after)" >&2
      continue
    fi

    # Use a per-fixture directory so source-derived file stems cannot collide,
    # then rename the artifacts to the fixture directory name.
    local tmp="$out_dir/.$name"
    rm -rf "$tmp"
    mkdir -p "$tmp"
    npx tsx "$ROOT/$cli_entrypoint" --old "$before" --new "$after" --out "$tmp" --json
    mv "$tmp"/*.html "$out_dir/$name.html"
    mv "$tmp"/*.diff.json "$out_dir/$name.diff.json"
    rm -rf "$tmp"
    rendered=$((rendered + 1))
  done

  echo "Rendered $rendered $product fixture(s) to: $out_dir"
}

render_flow() {
  local out_dir="${1:-$ROOT/flow-delta-out/fixtures}"
  render_fixture_set \
    "Flow" \
    "$ROOT/fixtures/diff" \
    "before.flow-meta.xml" \
    "after.flow-meta.xml" \
    "src/cli.ts" \
    "$out_dir"
}

render_flow_snapshots() {
  local out_dir="${1:-$ROOT/flow-delta-out/fixtures}"
  local fixture_dir="$ROOT/fixtures/diff"
  mkdir -p "$out_dir"
  local rendered=0
  for dir in "$fixture_dir"/*/; do
    [[ -d "$dir" ]] || continue
    local name
    name="$(basename "$dir")"
    local after="$dir/after.flow-meta.xml"
    [[ -f "$after" ]] || continue
    local tmp="$out_dir/.$name-snapshot"
    rm -rf "$tmp"
    mkdir -p "$tmp"
    npx tsx "$ROOT/src/cli.ts" --as-built --file "$after" --out "$tmp" --json
    mv "$tmp"/*.html "$out_dir/$name.snapshot.html"
    mv "$tmp"/*.diff.json "$out_dir/$name.snapshot.diff.json"
    rm -rf "$tmp"
    rendered=$((rendered + 1))
  done
  echo "Rendered $rendered Flow snapshot fixture(s) to: $out_dir"
}

render_flexipage() {
  local out_dir="${1:-$ROOT/flexipage-delta-out/fixtures}"
  render_fixture_set \
    "FlexiPage" \
    "$ROOT/fixtures/flexipage-diff" \
    "before.flexipage-meta.xml" \
    "after.flexipage-meta.xml" \
    "src/flexipage-cli.ts" \
    "$out_dir"
}

# One real, org-retrieved page per standard template, so the wireframe geometry can be
# eyeballed against the Salesforce template picker.
render_flexipage_template() {
  local out_dir="${1:-$ROOT/flexipage-delta-out/templates}"
  render_fixture_set \
    "FlexiPage template" \
    "$ROOT/fixtures/flexipage-template" \
    "before.flexipage-meta.xml" \
    "after.flexipage-meta.xml" \
    "src/flexipage-cli.ts" \
    "$out_dir"
}

case "$mode" in
  flow)
    render_flow "$out_arg"
    render_flow_snapshots "$out_arg"
    ;;
  flexipage)
    render_flexipage "$out_arg"
    ;;
  flexipage-template)
    render_flexipage_template "$out_arg"
    ;;
  all)
    if [[ -n "$out_arg" ]]; then
      render_flow "$out_arg/flow"
      render_flow_snapshots "$out_arg/flow"
      render_flexipage "$out_arg/flexipage"
      render_flexipage_template "$out_arg/flexipage-template"
    else
      render_flow
      render_flow_snapshots
      render_flexipage
      render_flexipage_template
    fi
    ;;
esac

echo "Open a rendered artifact in a browser from the output directory above."
