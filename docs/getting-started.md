---
title: Getting Started
description: Install FlowDelta and run local, Git, or org comparisons.
---

# Getting Started

FlowDelta is a TypeScript CLI tool that compares Salesforce Flow metadata and produces visual diffs. This guide helps you set up the project locally and run it for the first time.

## Prerequisites

- Node.js ≥ 18 (check with `node --version`)
- npm (bundled with Node)
- git
- A Salesforce org with Flow metadata (for real-world testing)
- Salesforce CLI (`sf`) and an authenticated org alias (only for org mode or
  live org smoke checks)

## Local setup

Clone the repo and install dependencies:

```bash
git clone https://github.com/Syntax-Syllogism/flow-delta.git
cd flow-delta
npm install
```

## Running the tests

The test suite is the fastest way to verify your setup works:

```bash
npm run typecheck       # Typecheck source, tests, and the worker example
npm test                # Full suite (parser + semantic diff + render + CLI + GitLab)
npm run test:parser     # Parser regression suite only (fast)
npm run test:org        # Offline org-mode runner and picker coverage
```

Tests use Node's built-in test runner and complete in under 10 seconds.
The typecheck is a separate compiler gate; see [Testing](testing.md) for its
three project scopes and the rendered-artifact harness.

## Running the CLI locally

During development, use `tsx` to run the CLI directly without building:

```bash
# File-mode comparison
npx tsx src/cli.ts --old path/to/before.flow-meta.xml --new path/to/after.flow-meta.xml --out ./output

# Git-mode comparison
npx tsx src/cli.ts --repo /path/to/sfdx-repo --from main --to feature-branch --path 'force-app/**/*.flow-meta.xml' --out ./output

# Org-mode comparison (requires sf authentication; pin versions for scripts)
npx tsx src/cli.ts --org my-org --flow My_Flow --from-version 1 --to-version 2 --out ./output --json
```

For published binary usage, see [docs/cli.md](cli.md).

## Rendering test fixtures

The project ships with fixture flows demonstrating all major change patterns. To render them locally:

```bash
npm run render:fixtures -- flow
```

This produces Flow HTML artifacts in `flow-delta-out/fixtures/`. To render the
FlexiPage fixture set instead, use `npm run render:fixtures -- flexipage`; to
render both sets, omit the selector. Open the selected artifacts in a browser to:
- Verify the visual diff renders correctly
- Test the interactive filters (All / After / Before / Changes only)
- Inspect the semantic property panel on modified nodes
- Check pan/zoom and panel resizing behavior

## Project structure

```
src/
  parser/               # Vendored Apache-2.0 parser from google-flow-lens (DO NOT EDIT)
  io/                   # File, git, and Salesforce org I/O
  model/                # Graph model types and canonicalization (graph-model.ts, build-model.ts)
  diff/                 # Deep diff and model comparison (deep-diff.ts, diff-model.ts)
  render/               # HTML rendering and layout (render-html.ts, layout.ts, section-schemas.ts)
  ci/                   # GitLab + GitHub reporting (report-core.ts, gitlab-report.ts, github-report.ts)
  util/                 # Helpers
  cli.ts                # Entry point and arg parsing

test/
  semantic-diff.test.ts # Main test suite with fixtures
  org-flow.test.ts      # Offline org-mode runner, picker, and error tests
  parser.test.ts        # Parser regression suite
  report-core.test.ts   # Shared reporting-core tests + package/bin/build checks
  gitlab-report.test.ts # GitLab reporter tests
  github-report.test.ts # GitHub reporter tests
  smoke-common.test.ts  # Shared smoke-harness scaffold tests
  smoke-github.test.ts  # GitHub smoke-harness workflow tests

fixtures/
  parse/                # Single-flow parser goldens
  diff/                 # before/after fixture pairs for diff testing
    noop_save/          # Zero-diff save (coordinate churn only)
    add_node/           # Node addition
    modify_assignment/  # Assignment modification
    modify_decision/    # Decision modification
    rewire_connector/   # Edge rewiring
    fault_path/         # Fault path changes

docs/
  architecture.md       # Pipeline and module map
  cli.md               # Command-line usage
  render.md            # HTML artifact and interactive features
  testing.md           # Test layout and fixture authoring
  ci.md                # GitLab integration
  publishing.md        # Build and release
  vendoring.md         # Parser provenance and do-not-edit policy
```

## Common development workflows

### Adding a new test case

1. Retrieve a flow from your org in both before/after states
2. Save them as `fixtures/diff/<case_name>/before.flow-meta.xml` and `after.flow-meta.xml`
3. Add a row to the `DIFF_CASES` table in `test/semantic-diff.test.ts` with expected node/edge counts
4. Run `npm test` to verify
5. Run `npm run render:fixtures` to visually inspect the result

See [docs/testing.md](testing.md) for details.

### Understanding the pipeline

The code follows a linear pipeline:

```
XML (before) ┐
             ├─► parser ─► GraphModel ─┐
XML (after)  ┘              (build-model)├─► FlowDiff ─► layout ─► HTML + JSON
                                        ┊   (diff-model)  (render)
```

See [docs/architecture.md](architecture.md) for the full module map and invariants.

### Debugging a diff issue

If a diff doesn't look right:

1. **Verify parsing**: Run `npx tsx src/cli.ts --old before.xml --new after.xml --out out --json` and inspect `out/*.diff.json` to see the raw diff structure
2. **Check canonicalization**: Review [docs/architecture.md#invariants](architecture.md#invariants-that-must-hold) — coordinates, connector references, and array order should not produce diffs
3. **Render to inspect visually**: Open the `.html` artifact in a browser and check the semantic property panel for each changed node

See [docs/debugging.md](debugging.md) for more troubleshooting tips.

## Next steps

- Read [docs/architecture.md](architecture.md) for the conceptual pipeline
- Read [docs/render.md](render.md) to understand the interactive HTML features
- Explore the test fixtures in `fixtures/diff/` to see real-world change patterns
- Check [CONTRIBUTING.md](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.8.0/CONTRIBUTING.md) for code style and PR expectations

## Questions?

See [docs/debugging.md](debugging.md) for common issues, or open an issue on [GitHub](https://github.com/Syntax-Syllogism/flow-delta/issues).
