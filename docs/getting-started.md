---
title: Getting Started
description: Install FlowDelta and run local, Git, or org comparisons.
---

# Getting started

FlowDelta is a TypeScript CLI that compares Salesforce Flow metadata and produces a visual diff. This page gets you from a fresh clone to a first run.

## Prerequisites

- Node.js 18 or later (`node --version`)
- npm, which comes with Node
- git
- Real Flow metadata to try it on (optional, but more fun)
- The Salesforce CLI (`sf`) and an authenticated org alias, only for org mode and live org smoke checks

## Set up

```bash
git clone https://github.com/Syntax-Syllogism/flow-delta.git
cd flow-delta
npm install
```

## Run the tests

The test suite is the quickest way to confirm your setup works:

```bash
npm run typecheck       # typecheck source, tests, and the worker example
npm test                # full suite: parser, semantic diff, render, CLI, GitLab
npm run test:parser     # parser regression suite only (fast)
npm run test:org        # offline org-mode runner and picker coverage
```

Tests use Node's built-in runner and finish in under 10 seconds. The typecheck is a separate gate. [Testing](testing.md) explains its three project scopes and the rendered-artifact harness.

## Run the CLI locally

During development, `tsx` runs the CLI directly, so there's nothing to build:

```bash
# File mode
npx tsx src/cli.ts --old path/to/before.flow-meta.xml --new path/to/after.flow-meta.xml --out ./output

# Git mode
npx tsx src/cli.ts --repo /path/to/sfdx-repo --from main --to feature-branch --path 'force-app/**/*.flow-meta.xml' --out ./output

# Org mode (needs sf authentication; pin versions in scripts)
npx tsx src/cli.ts --org my-org --flow My_Flow --from-version 1 --to-version 2 --out ./output --json
```

For the published binaries, see [CLI usage](cli.md).

## Render the fixtures

The repo ships fixture flows that cover the main kinds of change. Render the Flow set with:

```bash
npm run render:fixtures -- flow
```

The HTML lands in `flow-delta-out/fixtures/`. Use `npm run render:fixtures -- flexipage` for the FlexiPage set, or leave off the selector to render both. Open an artifact in a browser and check that:

- the visual diff renders correctly;
- the filters (All / After / Before / Changes only) work;
- the side panel shows property changes for a modified node;
- pan, zoom, and panel resizing behave.

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
  cli.md                # Command-line usage
  render.md             # HTML artifact and interactive features
  testing.md            # Test layout and fixture authoring
  ci.md                 # GitLab integration
  publishing.md         # Build and release
  vendoring.md          # Parser provenance and do-not-edit policy
```

## Common tasks

### Add a test case

1. Retrieve a flow from your org in its before and after states.
2. Save them as `fixtures/diff/<case_name>/before.flow-meta.xml` and `after.flow-meta.xml`.
3. Add a row to the `DIFF_CASES` table in `test/semantic-diff.test.ts` with the expected node and edge counts.
4. Run `npm test`.
5. Run `npm run render:fixtures` and look at the result.

More in [Testing](testing.md).

### Follow the pipeline

The code is a straight line:

```
XML (before) ┐
             ├─► parser ─► GraphModel ─┐
XML (after)  ┘              (build-model)├─► FlowDiff ─► layout ─► HTML + JSON
                                        ┊   (diff-model)  (render)
```

[Architecture](architecture.md) has the module map and the invariants.

### Debug a diff that looks wrong

1. **Check the raw diff.** Run `npx tsx src/cli.ts --old before.xml --new after.xml --out out --json` and read `out/*.diff.json`.
2. **Check canonicalization.** Coordinates, connector references, and array order shouldn't produce diffs. See [the invariants](architecture.md#invariants-that-must-hold).
3. **Look at the render.** Open the `.html` and check the side panel for each changed node.

[Debugging and troubleshooting](debugging.md) has more.

## Where next

- [Architecture](architecture.md), for the pipeline.
- [Rendering](render.md), for the interactive HTML.
- The fixtures in `fixtures/diff/`, for real change patterns.
- [CONTRIBUTING.md](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/CONTRIBUTING.md), for code style and PR expectations.

Stuck? Try [Debugging and troubleshooting](debugging.md), or open an issue on [GitHub](https://github.com/Syntax-Syllogism/flow-delta/issues).
