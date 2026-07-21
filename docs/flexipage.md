# FlexiPageDelta

FlexiPageDelta is the sibling metadata-diff tool for Salesforce
`.flexipage-meta.xml` files. It converts an old/new pair into a semantic diff,
an offline outline HTML artifact with an optional template-aware wireframe
canvas, and an optional machine-readable
`PageDiff` JSON file. It is a separate binary family from FlowDelta.

## Pipeline and modules

The FlexiPage pipeline is:

```text
XML (old/new) -> xml2js parser -> PageModel -> PageDiff -> outline/wireframe HTML + diff.json
```

| Module | Responsibility |
| --- | --- |
| `src/io/read-metadata.ts` / `src/io/discover-git-metadata.ts` | Shared local/Git metadata reading and path discovery; see [metadata-io.md](metadata-io.md). |
| `src/flexipage/parse.ts` | Parse FlexiPage XML, preserve recursive property structure, and canonicalize nested facet identities. |
| `src/flexipage/page-model.ts` | Define page headers, ordered regions, identifier-aware components/fields, and recursive property values. |
| `src/flexipage/diff-page.ts` | Match unique canonical region paths and identifier-aware items with LCS; attach breadcrumbs and visibility notes. |
| `src/flexipage/render-outline.ts` | Render the hierarchical, self-contained outline artifact, select wireframe geometry, and drive the shared rollup digest panel. |
| `src/flexipage/render-wireframe.ts` | Render registry-driven slot placement, nested stacks, removal/orphan appendices, and top-level change rollup pills. |
| `src/flexipage/template-geometry.ts` | Store and validate the curated template geometry registry. |
| `src/flexipage-cli.ts` | Orchestrate file and git modes and write artifacts. |
| `src/ci/flexipage-gitlab-report.ts` / `flexipage-github-report.ts` | Post FlexiPage-specific sticky comments using the shared CI core. |

The shared `deepDiff` implementation supplies generic `{path, before, after}`
property changes. `report-core.ts` uses a vocabulary-driven comment builder for
both products. `render/shell.ts` is the shared offline artifact shell consumed
by both the FlexiPage outline renderer and Flow's graph renderer. It owns the
common theme, filter, and detail-panel chrome; each renderer retains its own
canvas and product-specific client behavior.

## Model and identity rules

FlexiPages are modeled as ordered trees:

- Curated page scalars are `masterLabel`, `type`, `sobjectType`, `template`,
  `parentFlexiPage`, and `description`.
- Regions are anchored by their `name`, with `type`, `mode`, and ordered items.
- Components preserve an optional `identifier` and use
  `(componentName, identifier)` for item identity. Their properties retain
  recursive structure instead of flattening nested XML into strings.
- Field items preserve `(fieldItem, identifier)` identity. Named
  `fieldInstanceProperties` merge into a stable keyed object, and
  `visibilityRule` retains its criteria and `booleanFilter` structure.
- A component property that names a Facet region becomes a `facetRef`; the
  outline nests that Facet beneath the referencing component.

The semantic invariants are:

1. Component property order and XML region-block order are cosmetic.
2. Referenced GUID Facets are resolved transitively from each top-level region
   into stable, human-readable paths such as
   `main › flexipage:tab#detailsTab (Details) › body`; raw GUIDs never enter a
   canonical path. Duplicate sibling signals receive a deterministic positional
   suffix, and unreferenced GUID Facets use a content-hash fallback.
3. Canonical region paths are unique, so nested regions cannot collapse in the
   diff map or silently drop their items.
4. Components and fields within a region are matched by LCS on their
   identifier-aware identities, so an insertion does not cascade into false
   modifications. Within-region move detection remains a separate follow-up.
5. Field-property and visibility-rule changes produce recursive property paths;
   added or removed fields carrying a visibility rule are tagged `has visibility
   rule`. Region and item diffs carry top-level-rooted human breadcrumbs.
6. Root scalar changes appear in `pageChanges`; whole-page add/delete cases
   skip root-header comparison.
7. Region `type`/`mode` changes are marked as modified and counted as
   `summary.modifiedRegions`, so they remain visible to CI reporting.

## CLI

File mode compares two local files:

```bash
npx flexipage-delta \
  --old path/to/before.flexipage-meta.xml \
  --new path/to/after.flexipage-meta.xml \
  --out ./flexipage-delta-out \
  --json
```

Git mode compares refs. The default path glob is
`force-app/**/*.flexipage-meta.xml`:

```bash
npx flexipage-delta \
  --repo /path/to/sfdx-repo \
  --from <base-ref> --to <head-ref> \
  --changed-only \
  --out ./flexipage-delta-out \
  --json
```

`--path` accepts a literal path or `*`, `**`, and `?` glob patterns. Added and
deleted pages are discovered from the union of both refs; a deleted page keeps
the old page label for its output stem. Each page writes `<safe-name>.html`,
and `--json` additionally writes `<safe-name>.diff.json`. The default output
directory is `./flexipage-delta-out`.

## Outline and wireframe artifact

The HTML artifact is one offline document containing inline CSS and JavaScript.
It provides `All`, `After`, `Before`, and `Changes only` filters, a
System/Light/Dark theme control, a resizable/collapsible detail panel, and
click-for-deltas rows. Regions contain ordered component rows; referenced
Facets are nested under their tab or tabset component. The shared shell keeps
the Outline/Wireframe selector and theme control on one row when a wireframe is
available, with the theme control on the far right. Theme selection uses the
same `flow-delta-theme` storage key as FlowDelta.

Template changes receive a prominent page-level callout. Generic property
changes use the same before/after value grammar as FlowDelta. Nested region and
item breadcrumbs appear in the selected detail panel; the row keeps the path as
`data-item-path` without printing the full ancestry inline. Fields added or
removed with conditional visibility show a styled `has visibility rule` note.
When the after template is present in the geometry registry and its slots
reconcile with the current page regions, the artifact includes a Wireframe
canvas and opens there by default; otherwise it remains Outline-only. The
selected canvas is retained in browser storage under `flow-delta-view`, with
invalid or inaccessible values falling back to the generated default.

### Wireframe change rollups and digest

The Wireframe remains a map rather than a nested geometry view. For each
top-level slot, the renderer rolls up every non-`unchanged` descendant
`ItemDiff`, plus any direct region-level `type`/`mode` change, by the first
segment of its breadcrumb path. A changed region cell retains its own status
badge and gains one pill such as `5 changes`; unchanged cells have no pill.
Derived region status from changed child items is not counted a second time.

Clicking the pill opens a digest in the shared detail panel. Digest entries are
grouped by the nearest breadcrumb ancestor with a human-facing parenthesized
label, falling back to the penultimate segment when no such label exists. This
keeps headings such as `Account Information` and `Additional Information`
instead of exposing unlabeled connector or column segments. Clicking an entry
uses the existing item detail path, including generic property deltas and
visibility-rule notes; direct region changes are represented as equivalent
detail entries. The Back control returns to the digest. The pill is a separate
button with propagation stopped, so item-row clicks inside the cell continue to
open their own details and the interaction never switches to Outline.

### Template wireframe

`src/flexipage/template-geometry.ts` contains curated geometry for the
supported record, app, and home templates. Registry keys are canonicalized as
namespace-qualified names (`flexipage:...` for FlexiPage-owned templates), with
bare-name aliases retained for compatibility; already-qualified keys such as
`home:desktopTemplate` remain unchanged. Geometry is validated at module load
and frozen at runtime.

The after/current template drives placement, including template changes. Rows
use CSS-grid proportions, and stacked families render nested rows with their
inner widths. Empty registry slots remain visible. A deleted region is placed
in its slot when that slot still exists; deleted regions without a current slot
are listed in `Removed (not in current template)`. Unreferenced Facet regions
are listed separately as `Unplaced facet regions` and retain their actual diff
status. Unknown templates or slot mismatches fall back to the Outline view.

## CI reporting

The package ships:

- `flexipage-delta-gitlab` for GitLab MR comments.
- `flexipage-delta-github` for GitHub PR comments.

Both read non-zero `*.diff.json` files and reuse the existing artifact-link and
sticky-comment patterns. The FlexiPage marker is
`<!-- FlexiPageDelta:report -->`; the summary columns are page, component
counts, region counts, page attributes, and the artifact link. A template-only
change is non-zero and therefore still receives a comment.

See [cli.md](cli.md), [render.md](render.md), and [ci.md](ci.md) for the
shared usage and reporting conventions.

## Fixtures and tests

FlexiPage semantic fixtures live under `fixtures/flexipage-diff/<case>/`, and
retrieved/template-focused pairs live under
`fixtures/flexipage-template/<template>/`. The
`nestedDynamicForms` pair covers transitive tabs/accordion/field-section/column
paths, GUID churn, the former collision-loser `+2/−2/~1` scenario, and a
visibility-rule addition. Both fixture families are covered by
`test/flexipage-delta.test.ts`, including registry slots, nested stacks,
fallback behavior, empty slots, deleted-slot handling, facets, artifact
controls, wireframe rollup counts, direct-region aggregation, multi-container
digest grouping, pill-versus-row click isolation, digest drill-down/back
navigation, CLI file mode, and CLI git mode.

Run the focused suite with:

```bash
node --import tsx --test test/flexipage-delta.test.ts
```

Run the full project suite with `npm test` and build all six published
entrypoints with `npm run build`.

## Current boundaries

The current implementation intentionally defers within-region move detection,
per-component semantic schemas/friendly property labels, faithful side-by-side
before/after template geometry, and a unified extension-dispatching front end.
These are follow-up improvements, not parser or diff correctness requirements
for the current sibling tool.
