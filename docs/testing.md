---
title: Testing
description: Test suites, fixtures, and rendered-artifact checks.
---

# Testing

Tests use the Node built-in runner (`node:test` + `node:assert/strict`) executed
through `tsx`.

```bash
npm run typecheck    # source, DOM-harness tests, and Cloudflare worker example
npm test            # parser suite + semantic diff / render / CLI + CI reporter coverage
npm run test:parser # parser regression suite only
npm run test:org    # offline Salesforce org-mode runner, picker, and error coverage
```

`npm run typecheck` runs the real TypeScript compiler in three scoped projects:
`tsconfig.json` checks source and scripts without browser globals,
`tsconfig.test.json` scopes the test include; its harness imports happy-dom's
types.
`tsconfig.worker.json` checks the Cloudflare worker example with its worker
types. The command's exit code is the gate; it runs before build and tests in
`prepublishOnly` and as a step in repository CI.

## Layout

- `test/parser.test.ts` — the vendored parser's own suite, ported to `node:test`
  (proves the Apache-2.0 parser behaves identically under Node). See
  [vendoring.md](vendoring.md).
- `test/org-flow.test.ts` — offline org-mode coverage: Tooling version parsing,
  exact retrieve-path resolution, token-leak protection, picker formatting and
  defaults, dispatch, error mapping, and non-TTY behavior.
- `test/semantic-diff.test.ts` — everything we built: canonicalization,
  flow-header extraction, `deepDiff` paths, node/edge/header classification,
  edge-id rules, the HTML render, the CLI in file, git, and org modes, and the
  real before/after fixture assertions.
- `test/metadata-io.test.ts` — shared metadata/Git IO contract coverage:
  literal and supported glob matching, separator normalization,
  union/changed-only discovery, deterministic paths, and Git error handling.
- `test/report-core.test.ts` — the platform-agnostic reporting core shared by
  both products and CI platforms (`buildComment`, the vocabulary-driven builder,
  `isZeroSummary`, `findStickyNote`), plus the package/bin/build smoke checks
  (all six published binaries).
- `test/gitlab-report.test.ts` — GitLab-specific reporting: the artifact-URL
  scheme and the sticky-note `upsertComment` upsert behavior (list → PUT/POST).
- `test/github-report.test.ts` — GitHub-specific reporting: the artifact-URL
  scheme, the issue-comments `upsertComment` upsert behavior (list →
  PATCH/POST, no `/user` call), and `main()` orchestration (PR-number
  resolution from `GITHUB_EVENT_PATH`/`--pr`, no-op paths, attribute-only
  diffs). See [ci.md](ci.md) for the reporting flows themselves.
- `test/smoke-common.test.ts` — unit coverage for the shared smoke-harness
  scaffold helpers used by both the GitLab and GitHub smoke scripts (e.g.
  `renameFlowMetadata`, `stageAndCommit`).
- `test/smoke-github.test.ts` — GitHub smoke entrypoint and generated workflow
  coverage, including both Flow and FlexiPage diff/report pipelines.

## Rendered-artifact DOM harness

`test/dom-harness.ts` provides the default seam for testing generated client
behavior. `renderDom(html, storage?)` parses a complete rendered Flow or
FlexiPage artifact with `happy-dom`, enables inline JavaScript evaluation, seeds
`localStorage` before the document is parsed, waits for the document to settle,
and returns the live `window` and `document`. Both renderer suites assert the
shared shell contract (four filters, three theme choices, panel controls,
offline output, and theme-key continuity) in addition to product-specific
behavior. Tests should interact with the returned DOM and storage rather than
extracting or matching the generated script text.

The harness is test-only: `happy-dom` is a development dependency, and the
rendered artifacts remain self-contained and offline. Load-time client script
errors fail `renderDom`; its `errors` collection also exposes errors raised by
later interactions so tests can assert the rendered client remains clean. It is
used by both
`test/semantic-diff.test.ts` and `test/flexipage-delta.test.ts` for filters,
theme and view persistence, detail-panel selection, keyboard activation, and
stored/invalid preference handling. The pointer-driven panel resizer is
deliberately excluded because it depends on layout geometry that `happy-dom`
does not compute; visual/manual checks remain the appropriate coverage for that
interaction.

## Fixtures (`fixtures/`)

- `fixtures/parse/*.flow-meta.xml` — single-flow goldens for parser coverage.
- `fixtures/diff/<case>/before.flow-meta.xml` + `after.flow-meta.xml` — real
  before/after pairs retrieved from an org, one directory per scenario:
  `noop_save`, `add_node`, `modify_assignment`, `modify_decision`,
  `rewire_connector`, `fault_path`, plus header-only cases `deactivate_flow` and
  `bump_api_version`.

`noop_save` is the most important: a real save with **only** coordinate churn,
asserted to produce zero node/edge changes — the headline canonicalization gate.
`deactivate_flow` is the headline flow-level fixture: the graph is unchanged, but
`status` moves from `Active` to `Draft` and `summary.changedFlowAttributes` is 1.

### FlexiPage fixtures

FlexiPage pairs live under `fixtures/flexipage-diff/<case>/`:

- `noop_save` — Facet GUID regeneration, property reordering, and region-block
  reordering; the semantic summary must be all zero.
- `insert_component_top` — LCS insertion without a modification cascade.
- `change_template` — page-attribute-only change with a reporter callout.
- `add_component` — component addition.
- `modify_component_property` — generic property delta.

The `fixtures/flexipage-template/nestedDynamicForms/` pair covers transitive
tab/accordion/field-section/column nesting, regenerated Facet GUIDs, the
former collision-loser `+2/−2/~1` add/remove scenario, and a field added with a
visibility rule. The focused suite also locks duplicate field identity,
name-keyed multi-property diffs, criterion-level visibility changes, and
breadcrumb placement, wireframe rollup counts, direct region-plus-nested
aggregation, multi-container digest grouping, pill-versus-row click isolation,
and digest drill-down/back navigation.

`test/flexipage-delta.test.ts` walks these on-disk pairs, and also covers
reorder-as-delete-plus-add, region additions/removals and mode changes,
whole-page add/delete, parser shape coverage, orphan GUID facets, outline
rendering, CLI file mode, and CLI git mode against two temporary commits.

## Adding a diff fixture

1. Retrieve the flow, commit it, make the change in the org, retrieve again — the
   two versions are your `before`/`after`. Keep both files' internal flow
   `<label>`/`fullName` consistent so artifact names aren't confusing.
2. Drop them under `fixtures/diff/<your_case>/`.
3. Add a row to the `DIFF_CASES` table in `test/semantic-diff.test.ts` with the
   expected summary counts, and (optionally) a targeted assertion on the changed
   property path or edge.
4. Confirm with `npm test` and eyeball the render via
   `npm run render:fixtures -- flow`.

Capture the expected counts from the validated CLI output (`--json` summary)
rather than guessing.

## Manual / visual smoke

The automated org-mode suite is offline and never contacts Salesforce. A live
org smoke remains manual: with `sf` authenticated, list a multi-version Flow,
retrieve two versions, and confirm the generated artifact in the reported
output directory. This check is intentionally not part of `npm test`.

`npm run render:fixtures -- flow` writes Flow artifacts to
`flow-delta-out/fixtures/`; `npm run render:fixtures -- flexipage` writes
FlexiPage artifacts to `flexipage-delta-out/fixtures/`; and the no-argument
form renders both sets. Open the selected artifacts and check:

- Status colors (added / deleted / modified / unchanged) and legend.
- The four view filters (All / After / Before / Changes only).
- Directional edge arrowheads (normal solid / fault dashed).
- The side panel with semantic organization:
  - For type-specific nodes (decision, assignment, record*, etc.), changes are
    organized into named sections (e.g., "Outcomes", "Field Mappings"). Click a
    complex modified node to see structured tables with columns.
  - For added/deleted nodes, empty-state messages are shown.
  - For simple scalar changes, the fallback "Configuration" section groups them.
- Pan/zoom on the canvas.
- Resizing the side panel by dragging its left edge.
- Collapsing/reopening the panel via the toggle button.
- Flow-level banners for `deactivate_flow` and `bump_api_version`; the graph
  should remain unchanged while the banner reports the root-attribute changes.

On `rewire_connector`, verify that `After` and `Before` each render as a coherent
single-state graph. A fuller manual checklist and the fixture scenario matrix live
in this file and the inline comments in `test/semantic-diff.test.ts`.

For FlexiPage fixtures, the automated checks are the primary gate. Manual visual
review is optional and should inspect the nested region/Facet outline, status
filters, template callout, wireframe change-count pills, grouped digest
headings, digest drill-down/back behavior, and detail panel. Use
`npm run render:fixtures -- flexipage` for that review. See
[flexipage.md](flexipage.md) for the as-built artifact behavior and known
boundaries.
