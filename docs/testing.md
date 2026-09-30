---
title: Testing
description: Test suites, fixtures, and rendered-artifact checks.
---

# Testing

Tests use the Node built-in runner (`node:test` and `node:assert/strict`), run through `tsx`.

```bash
npm run typecheck    # source, DOM-harness tests, and Cloudflare worker example
npm test            # parser suite + semantic diff / render / CLI + CI reporter coverage
npm run test:parser # parser regression suite only
npm run test:org    # offline Salesforce org-mode runner, picker, and error coverage
```

`npm run typecheck` runs the TypeScript compiler on three projects:

- `tsconfig.json` checks source and scripts, without browser globals.
- `tsconfig.test.json` checks the tests. Its harness imports happy-dom's types.
- `tsconfig.worker.json` checks the Cloudflare worker example with its worker types.

The exit code is the gate. It runs before build and tests in `prepublishOnly`, and as a step in repository CI.

## Layout

- `test/parser.test.ts`: the vendored parser's own suite, ported to `node:test`. It shows the Apache-2.0 parser behaves the same under Node. See [vendoring.md](vendoring.md).
- `test/org-flow.test.ts`: offline org-mode coverage. Tooling version parsing, exact retrieve-path resolution, token-leak protection, picker formatting and defaults, dispatch, error mapping, and non-TTY behavior.
- `test/semantic-diff.test.ts`: the core of FlowDelta. Canonicalization, flow-header extraction, `deepDiff` paths, node/edge/header classification, edge-id rules, the HTML render, the CLI in file, git, org, and as-built snapshot modes, and the real before/after fixture assertions.
- `test/metadata-io.test.ts`: the shared metadata and Git IO contract. Literal and supported glob matching, separator normalization, union and changed-only discovery, deterministic paths, and Git error handling.
- `test/report-core.test.ts`: the reporting core shared by both products and both CI platforms (`buildComment`, the vocabulary-driven builder, `isZeroSummary`, `findStickyNote`). Also the package, bin, and build smoke checks for all six published binaries.
- `test/gitlab-report.test.ts`: GitLab reporting. The artifact-URL scheme and the sticky-note `upsertComment` behavior (list, then PUT or POST).
- `test/github-report.test.ts`: GitHub reporting. The artifact-URL scheme, the issue-comments `upsertComment` behavior (list, then PATCH or POST, no `/user` call), and `main()` orchestration (PR-number resolution from `GITHUB_EVENT_PATH` or `--pr`, no-op paths, attribute-only diffs). See [ci.md](ci.md) for the reporting flows themselves.
- `test/smoke-common.test.ts`: the shared smoke-harness helpers used by both the GitLab and GitHub smoke scripts (for example `renameFlowMetadata` and `stageAndCommit`).
- `test/smoke-github.test.ts`: the GitHub smoke entrypoint and generated workflow, including both Flow and FlexiPage diff and report pipelines.

## Rendered-artifact DOM harness

`test/dom-harness.ts` is the default way to test generated client behavior. `renderDom(html, storage?)` does the following:

1. Parses a complete rendered Flow or FlexiPage artifact with `happy-dom`.
2. Enables inline JavaScript.
3. Seeds `localStorage` before the document is parsed.
4. Waits for the document to settle.
5. Returns the live `window` and `document`.

Both renderer suites assert the shared shell contract: four filters, three theme choices, panel controls, offline output, and theme-key continuity. They also assert product-specific behavior. Tests should interact with the returned DOM and storage. Don't extract or match the generated script text.

The harness is test-only. `happy-dom` is a development dependency, and rendered artifacts stay self-contained and offline. Script errors at load time fail `renderDom`. Its `errors` collection also exposes errors raised by later interactions, so tests can assert the client stays clean.

`test/semantic-diff.test.ts` and `test/flexipage-delta.test.ts` both use it for filters, theme and view persistence, detail-panel selection, keyboard activation, and stored or invalid preference handling.

The pointer-driven panel resizer is deliberately not covered. It depends on layout geometry that `happy-dom` doesn't compute, so check it visually.

## Fixtures (`fixtures/`)

- `fixtures/parse/*.flow-meta.xml`: single-flow goldens for parser coverage.
- `fixtures/diff/<case>/before.flow-meta.xml` and `after.flow-meta.xml`: real before/after pairs retrieved from an org, one directory per scenario. The scenarios are `noop_save`, `add_node`, `modify_assignment`, `modify_decision`, `rewire_connector`, and `fault_path`. The header-only cases are `deactivate_flow` and `bump_api_version`.

Two fixtures matter most:

- `noop_save` is a real save with **only** coordinate churn. It must produce zero node and edge changes. This is the main canonicalization gate.
- `deactivate_flow` is the main flow-level fixture. The graph is unchanged, but `status` moves from `Active` to `Draft` and `summary.changedFlowAttributes` is 1.

`npm run render:fixtures -- flow` also renders each fixture's `after` file as an as-built snapshot. It's named `<fixture>.snapshot.html`, with its optional JSON beside it.

### FlexiPage fixtures

FlexiPage pairs live under `fixtures/flexipage-diff/<case>/`:

- `noop_save`: Facet GUID regeneration, property reordering, and region-block reordering. The semantic summary must be all zero.
- `insert_component_top`: LCS insertion with no modification cascade.
- `change_template`: a page-attribute-only change with a reporter callout.
- `add_component`: a component addition.
- `modify_component_property`: a generic property delta.

The `fixtures/flexipage-template/nestedDynamicForms/` pair covers:

- transitive tab, accordion, field-section, and column nesting;
- regenerated Facet GUIDs;
- the former collision-loser `+2/−2/~1` add/remove scenario; and
- a field added with a visibility rule.

The focused suite also locks down:

- duplicate field identity;
- name-keyed multi-property diffs;
- criterion-level visibility changes;
- breadcrumb placement;
- wireframe rollup counts;
- direct region-plus-nested aggregation;
- multi-container digest grouping;
- pill-versus-row click isolation; and
- digest drill-down and back navigation.

`test/flexipage-delta.test.ts` walks these on-disk pairs. It also covers:

- reorder as delete plus add;
- region additions, removals, and mode changes;
- whole-page add and delete;
- parser shape coverage;
- orphan GUID facets;
- outline rendering;
- CLI file mode; and
- CLI git mode against two temporary commits.

## Adding a diff fixture

1. Retrieve the flow and commit it. Make the change in the org and retrieve again. The two versions are your `before` and `after`. Keep the internal flow `<label>` and `fullName` the same in both files, so artifact names aren't confusing.
2. Put them under `fixtures/diff/<your_case>/`.
3. Add a row to the `DIFF_CASES` table in `test/semantic-diff.test.ts` with the expected summary counts. Optionally add a targeted assertion on the changed property path or edge.
4. Run `npm test`, and check the render with `npm run render:fixtures -- flow`.

Take the expected counts from the validated CLI output (the `--json` summary). Don't guess them.

## Manual and visual smoke

The automated org-mode suite is offline and never contacts Salesforce. A live org smoke is manual. With `sf` authenticated, list a multi-version Flow, retrieve two versions, and check the generated artifact in the reported output directory. This is intentionally not part of `npm test`.

`npm run render:fixtures -- flow` writes Flow artifacts to `flow-delta-out/fixtures/`. `npm run render:fixtures -- flexipage` writes FlexiPage artifacts to `flexipage-delta-out/fixtures/`. With no argument, it renders both. Open the artifacts and check:

- Status colors (added, deleted, modified, unchanged) and the legend.
- The four view filters (All, After, Before, Changes only).
- Edge arrowheads: solid for normal edges, dashed for fault edges.
- The side panel and its semantic organization:
  - Type-specific nodes (decision, assignment, record*, and so on) group changes into named sections such as "Outcomes" and "Field Mappings". Click a complex modified node to see structured tables with columns.
  - Added and deleted nodes show empty-state messages.
  - Simple scalar changes fall back to a "Configuration" section.
- Pan and zoom on the canvas.
- Resizing the side panel by dragging its left edge.
- Collapsing and reopening the panel with the toggle button.
- Flow-level banners for `deactivate_flow` and `bump_api_version`. The graph should stay unchanged while the banner reports the root-attribute changes.

For snapshot artifacts (`<fixture>.snapshot.html`), check the type-color legend, the element inventory, the absence of diff filters, neutral one-sided properties, flow facts, and the provenance footer.

On `rewire_connector`, check that `After` and `Before` each render as a coherent single-state graph. A fuller manual checklist and the fixture scenario matrix are in this file and in the inline comments in `test/semantic-diff.test.ts`.

For FlexiPage fixtures, the automated checks are the main gate. Manual review is optional. If you do it, use `npm run render:fixtures -- flexipage` and inspect:

- the nested region and Facet outline;
- status filters;
- the template callout;
- wireframe change-count pills;
- grouped digest headings;
- digest drill-down and back behavior; and
- the detail panel.

See [flexipage.md](flexipage.md) for the as-built artifact behavior and known boundaries.
