---
title: FlexiPageDelta
description: Semantic diffs and wireframes for Salesforce Lightning pages.
---

# FlexiPageDelta

FlexiPageDelta is the sibling tool to FlowDelta, for Salesforce `.flexipage-meta.xml` files. Given an old and a new file, it produces:

- a semantic diff;
- an offline outline HTML artifact, with an optional template-aware wireframe canvas; and
- an optional machine-readable `PageDiff` JSON file.

It is a separate binary family from FlowDelta.

## Pipeline and modules

```text
XML (old/new) -> xml2js parser -> PageModel -> PageDiff -> outline/wireframe HTML + diff.json
```

| Module | Responsibility |
| --- | --- |
| `src/io/read-metadata.ts` / `src/io/discover-git-metadata.ts` | Shared local and Git metadata reading and path discovery. See [metadata-io.md](metadata-io.md). |
| `src/flexipage/parse.ts` | Parse FlexiPage XML into a raw `PageModel` and run the model transformation. |
| `src/flexipage/canonicalize-page.ts` | Canonicalize nested facet identities as a pure model transformation: stable paths, orphan hashes, rewritten references, and unique names. |
| `src/flexipage/page-model.ts` | Define page headers, ordered regions, identifier-aware components and fields, and recursive property values. |
| `src/flexipage/diff-page.ts` | Match unique canonical region paths and identifier-aware items with LCS. Attach breadcrumbs and visibility notes. |
| `src/flexipage/component-schemas.ts` | Turn property changes on high-signal components into ordered, friendly groups for the detail panel. Unknown components and uncovered properties keep generic fallbacks. |
| `src/flexipage/render-outline.ts` | Render the hierarchical, self-contained outline artifact, select wireframe geometry, and drive the shared rollup digest panel. |
| `src/flexipage/render-wireframe.ts` | Render registry-driven slot placement, nested stacks, removal and orphan appendices, and top-level change rollup pills. |
| `src/flexipage/template-geometry.ts` | Store and validate the curated template geometry registry. |
| `src/flexipage-cli.ts` | Run file and git modes and write artifacts. |
| `src/ci/flexipage-gitlab-report.ts` / `flexipage-github-report.ts` | Post FlexiPage-specific sticky comments, using the shared CI core. |

Shared pieces:

- `deepDiff` supplies generic `{path, before, after}` property changes.
- `report-core.ts` has a vocabulary-driven comment builder used by both products.
- `render/shell.ts` is the shared offline artifact shell, used by the FlexiPage outline renderer and Flow's graph renderer. It owns the common theme, filter, and detail-panel chrome. Each renderer keeps its own canvas and product-specific client behavior.

## Model and identity rules

FlexiPages are modeled as ordered trees:

- The curated page scalars are `masterLabel`, `type`, `sobjectType`, `template`, `parentFlexiPage`, and `description`.
- Regions are anchored by their `name`, with `type`, `mode`, and ordered items.
- Components keep an optional `identifier`. Item identity is `(componentName, identifier)`. Properties keep their recursive structure instead of being flattened into strings.
- Field items keep `(fieldItem, identifier)` identity. Named `fieldInstanceProperties` merge into a stable keyed object. `visibilityRule` keeps its criteria and `booleanFilter` structure.
- A component property that names a Facet region becomes a `facetRef`. The outline nests that Facet under the referencing component.

The semantic invariants:

1. Component property order and XML region-block order are cosmetic.
2. Referenced GUID Facets are resolved transitively from each top-level region into stable, readable paths such as `main › flexipage:tab#detailsTab (Details) › body`. Raw GUIDs never enter a canonical path. Duplicate sibling signals get a deterministic positional suffix. Unreferenced GUID Facets use a content-hash fallback.
3. Canonical region paths are unique, so nested regions can't collapse in the diff map or silently drop their items.
4. Components and fields within a region are matched by LCS on their identifier-aware identities, so an insertion doesn't cascade into false modifications. Move detection within a region is a separate follow-up.
5. Field-property and visibility-rule changes produce recursive property paths. Fields added or removed with a visibility rule are tagged `has visibility rule`. Region and item diffs carry human breadcrumbs rooted at the top level.
6. Root scalar changes appear in `pageChanges`. Whole-page add and delete cases skip the root-header comparison.
7. Region `type` and `mode` changes are marked as modified and counted in `summary.modifiedRegions`, so CI reporting still sees them.

## CLI

File mode compares two local files:

```bash
npx flexipage-delta \
  --old path/to/before.flexipage-meta.xml \
  --new path/to/after.flexipage-meta.xml \
  --out ./flexipage-delta-out \
  --json
```

Git mode compares refs. The default path glob is `force-app/**/*.flexipage-meta.xml`:

```bash
npx flexipage-delta \
  --repo /path/to/sfdx-repo \
  --from <base-ref> --to <head-ref> \
  --changed-only \
  --out ./flexipage-delta-out \
  --json
```

- `--path` accepts a literal path, or a glob using `*`, `**`, and `?`.
- Added and deleted pages are found from the union of both refs. A deleted page keeps the old page label for its output name.
- Each page writes `<safe-name>.html`. With `--json`, it also writes `<safe-name>.diff.json`.
- The default output directory is `./flexipage-delta-out`.

## Outline and wireframe artifact

The HTML artifact is one offline document with inline CSS and JavaScript. It has:

- `All`, `After`, `Before`, and `Changes only` filters;
- a System/Light/Dark theme control;
- a resizable, collapsible detail panel; and
- rows you click to see deltas.

Regions hold ordered component rows. Referenced Facets nest under their tab or tabset component. When a wireframe is available, the Outline/Wireframe selector and the theme control share one row, with the theme control on the far right. Theme selection uses the same `flow-delta-theme` storage key as FlowDelta.

Other behavior:

- A template change gets a prominent page-level callout.
- Generic property changes use the same before/after value style as FlowDelta.
- Nested region and item breadcrumbs appear in the selected detail panel. The row keeps the path as `data-item-path` and doesn't print the full ancestry inline.
- Fields added or removed with conditional visibility show a styled `has visibility rule` note.
- If the after template is in the geometry registry and its slots match the current page regions, the artifact includes a Wireframe canvas and opens there by default. Otherwise it is Outline-only.
- The selected canvas is kept in browser storage under `flow-delta-view`. Invalid or inaccessible values fall back to the generated default.

### Wireframe change rollups and digest

The Wireframe is a map, not a nested geometry view. For each top-level slot, the renderer rolls up every non-`unchanged` descendant `ItemDiff`, plus any direct region-level `type` or `mode` change, by the first segment of its breadcrumb path.

- A changed region cell keeps its own status badge and gains one pill, such as `5 changes`. Unchanged cells have no pill.
- Region status derived from changed child items isn't counted a second time.

Clicking the pill opens a digest in the shared detail panel:

- Entries are grouped by the nearest breadcrumb ancestor with a human-facing parenthesized label. If there is none, the penultimate segment is used. This keeps headings such as `Account Information` and `Additional Information`, and hides unlabeled connector or column segments.
- Clicking an entry uses the normal item detail path, including generic property deltas and visibility-rule notes. Direct region changes appear as equivalent detail entries.
- The Back control returns to the digest.
- The pill is a separate button with propagation stopped. Item-row clicks inside the cell still open their own details, and the interaction never switches to Outline.

### Component detail schemas

For modified components, the detail panel uses the hand-curated registry in `src/flexipage/component-schemas.ts`. Current schemas cover:

- `flowruntime:interview`
- related-list containers (`force:relatedListSingleContainer` and `force:relatedListContainer`)
- `force:highlightsPanel`
- `flexipage:tab`
- `flexipage:tabset`

Each gives a friendly component title and ordered groups such as `Flow`, `Input Variables`, `Related List`, `Display`, `Sorting`, `Tab`, and `Tabs`.

- Properties not covered on a known component appear in an `Other` group, with `humanizePath` labels.
- Components with no schema keep the original flat `{path, before → after}` lines.
- Schema resolution only enriches the embedded HTML panel data. `PageDiff`, summaries, and emitted `.diff.json` files are unchanged.
- The registry is offline. To extend it, add another component entry.

### Template wireframe

`src/flexipage/template-geometry.ts` has curated geometry for the supported record, app, and home templates.

- Registry keys are canonicalized as namespace-qualified names (`flexipage:...` for FlexiPage-owned templates). Bare-name aliases stay for compatibility. Already-qualified keys such as `home:desktopTemplate` are unchanged.
- Geometry is validated at module load and frozen at runtime.

The after (current) template drives placement, including for template changes.

- Rows use CSS-grid proportions. Stacked families render nested rows at their inner widths.
- Empty registry slots stay visible.
- A deleted region is placed in its slot if that slot still exists. Deleted regions with no current slot are listed under `Removed (not in current template)`.
- Unreferenced Facet regions are listed separately as `Unplaced facet regions` and keep their real diff status.
- Unknown templates and slot mismatches fall back to the Outline view.

## CI reporting

The package ships two reporters:

- `flexipage-delta-gitlab` for GitLab MR comments.
- `flexipage-delta-github` for GitHub PR comments.

Both read non-zero `*.diff.json` files and reuse the existing artifact-link and sticky-comment patterns.

- The FlexiPage marker is `<!-- FlexiPageDelta:report -->`.
- The summary columns are page, component counts, region counts, page attributes, and the artifact link.
- A template-only change counts as non-zero, so it still gets a comment.

See [cli.md](cli.md), [render.md](render.md), and [ci.md](ci.md) for shared usage and reporting conventions.

## Fixtures and tests

FlexiPage semantic fixtures live under `fixtures/flexipage-diff/<case>/`. Retrieved and template-focused pairs live under `fixtures/flexipage-template/<template>/`.

The `nestedDynamicForms` pair covers transitive tab, accordion, field-section, and column paths, GUID churn, the former collision-loser `+2/−2/~1` scenario, and a visibility-rule addition.

`test/flexipage-delta.test.ts` covers both fixture families. It also covers:

- registry slots, nested stacks, fallback behavior, empty slots, and deleted-slot handling;
- facets and artifact controls;
- wireframe rollup counts and direct-region aggregation;
- multi-container digest grouping;
- pill-versus-row click isolation and digest drill-down and back navigation; and
- CLI file mode and CLI git mode.

Run the focused suite:

```bash
node --import tsx --test test/flexipage-delta.test.ts
```

The pure canonicalization boundary is also tested directly with hand-built `PageModel` values, without going through `xml2js`:

```bash
node --import tsx --test test/flexipage-canonicalize.test.ts
```

Run the full suite with `npm test`. Build all six published entrypoints with `npm run build`.

## Current boundaries

These are deliberately deferred:

- move detection within a region;
- faithful side-by-side before/after template geometry; and
- a unified front end that dispatches by file extension.

They are follow-up improvements. They aren't parser or diff correctness requirements for this tool.
