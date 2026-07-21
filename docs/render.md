# Rendering

FlowDelta's renderer turns a `FlowDiff` into a single self-contained HTML
artifact plus an embedded client-oriented data payload. The generated page is fully
offline: CSS, SVG, and client-side JS are all inline, and the browser does not
fetch external assets.

## Embedded client payload

The HTML embeds one escaped JSON DTO for browser behavior. It contains:

- semantic node identity, label, status, and server-rendered `detailHtml`;
- semantic edge identity, source, target, and status; and
- geometry-only `union`, `after`, and `before` layouts, including their bounds.

The browser does not receive raw before/after snapshots or section-schema
definitions. Section schemas are applied during rendering, and the resulting
detail HTML is inserted into the panel when a node is selected. The separate
`*.diff.json` file, when requested with `--json`, remains the full machine-readable
`FlowDiff` for CI reporters and debugging; it is not the payload embedded in the
HTML artifact.

## Flow-level changes

When `FlowDiff.flowChanges` is present, the renderer floats a small tab over the
top-left corner of the canvas, styled to match the node panel's own collapsed
`.panel-reopen` affordance (same surface, border, radius, and shadow) so the
artifact has one disclosure idiom instead of two. This is for curated `<Flow>`
root attributes such as `status`, `apiVersion`, and `runInMode`; it is
intentionally outside the graph so Flow elements remain the only graph nodes,
and it reserves no layout row — the canvas and the node-detail panel both start
flush under the header whether or not there are flow-level changes.

Clicking the tab opens a popover anchored at the same corner. Status changes
get a prominent callout inside it. `Active -> Draft` / `Obsolete` /
`InvalidDraft` reads as a deactivation, `Draft` / `Obsolete` -> `Active` reads as
an activation, and other status transitions use a neutral status line; the tab
label and its dot color reflect the same classification before the popover is
even opened. Other attributes render as labeled before/after rows using the
same inserted/deleted value grammar as the node detail panel. The popover
closes on outside click, Escape, or selecting a node (node clicks stop
propagation for their own panel logic, so closing the popover is handled
explicitly rather than relying on bubbling to `document`).

The tab is omitted when there are no flow-level changes and for whole-flow
add/delete cases where one side has no header.

## Interactive diff filters

The HTML artifact includes four view presets:

- `All` — the default union view. This matches the original behavior on open.
- `After` — the new topology, with deleted nodes and edges hidden.
- `Before` — the old topology, with added nodes and edges hidden.
- `Changes only` — only added, deleted, and modified nodes plus their incident
  edges.

The filter is client-side only. Clicking or keyboard-activating a node still
opens its delta panel in every mode.

## Theme control

The header includes a compact `System / Light / Dark` theme control. `System` is
the default and follows the reviewer's operating-system color preference using
`prefers-color-scheme`; `Light` and `Dark` are explicit overrides.

Theme selection is client-side only and is persisted in `localStorage` under
`flow-delta-theme`. Missing, invalid, or inaccessible storage falls back to
`System`. The theme bootstrap script, CSS, and controls are all inline, so the
artifact remains fully offline and does not fetch external assets.

The shared artifact shell in `src/render/shell.ts` owns the theme bootstrap,
theme buttons, persistence, and the common filter/panel chrome for both
FlowDelta and FlexiPageDelta. Each renderer supplies only its canvas content,
product-specific styles, panel content, and client behavior.

## Layout strategy

`src/render/layout.ts` bakes three ELK layouts at CLI time:

- `union` — the full graph.
- `after` — the after-state subgraph.
- `before` — the before-state subgraph.

`Changes only` reuses the `union` layout geometry and hides unchanged nodes and
edges in the browser. The browser does not rerun ELK.

The renderer recomputes the active viewBox from the visible geometry so the
canvas stays centered on the selected view. That keeps `After` and `Before`
readable and avoids dangling edges to hidden nodes.

## Node detail panel

Clicking a node opens a right-side panel showing its property changes organized
into semantic sections. The panel is **resizable** (drag the left edge) and
**collapsible** (click the toggle button to hide/reopen).

### Section schemas

Property changes are organized by type-specific section schemas defined in
`src/render/section-schemas.ts`. Each schema declares:

- **`name`** — the section header (e.g., "Outcomes", "Field Mappings").
- **`paths`** — the top-level property keys this section owns (e.g., `["rules"]`
  for decision outcomes).
- **`render`** — one of:
  - `"lines"` — labeled scalar changes (default fallback).
  - `"table"` — array items as rows, with semantic columns.
  - `"grouped-table"` — nested structure: groups with headers, each containing an
    inner table.

**Examples:**

- **Decision nodes** render with a `"Outcomes"` grouped-table: each outcome is a
  group (labeled by rule name), and its conditions appear as a table with
  `Resource`, `Operator`, and `Value` columns.
- **Record Create/Update** render a `"Field Mappings"` table with `Field` and
  `Value` columns.
- **Record Lookup/Delete** render a `"Filters"` table with `Field`, `Operator`,
  and `Value` columns.

### Rendering behavior

**Modified nodes**: property changes are shown with before/after context.
- If only one column changed in a table row, unchanged sibling columns are shown
  in a faint style to provide context.
- Typed wrappers (e.g., `{ booleanValue: "true" }`) are unwrapped to their
  scalar value in the UI.
- String diffs use git-diff grammar: `+` (green) for additions, `−` (strikethrough
  red) for deletions, faint for unchanged.

**Added nodes**: show `"This node was added in the new version."` placeholder.

**Deleted nodes**: show `"This node was deleted from the previous version."` placeholder.

### Fallback grouping

Changes that don't match any section schema are grouped by:
1. Array names (if the change path is array-indexed) — e.g., changes to
   `myItems[0].field` are grouped under `"myItems"`.
2. A generic `"Configuration"` bucket for unstructured scalars.

## Key code paths

- `src/render/layout.ts` — layout baking and bounds measurement.
- `src/render/artifact-client-data.ts` — the browser DTO boundary: semantic
  node/edge data, pre-rendered detail HTML, and geometry-only baked views.
- `src/render/shell.ts` — shared offline document shell, theme persistence,
  filter dispatch, panel chrome, and optional Outline/Wireframe switching.
- `src/render/render-html.ts` — Flow SVG canvas, client-side graph/filter
  behavior, flow-level banner, and semantic node detail content.
- `src/render/section-schemas.ts` — type-specific property grouping schemas.

## Manual smoke

`npm run render:fixtures -- flow` writes Flow fixture artifacts to
`flow-delta-out/fixtures/`; `npm run render:fixtures -- flexipage` writes
FlexiPage artifacts to `flexipage-delta-out/fixtures/`; and the no-argument form
renders both sets. For `rewire_connector`, check that `After` and `Before` each
read as a coherent single-state graph and that switching between modes preserves
offline behavior.

For the detail panel, open a modified node with complex properties (e.g.,
`modify_decision` or `modify_assignment`) and verify:
- Sections appear with the correct semantic names.
- Tables render columns correctly and unwrap typed values.
- Unchanged sibling columns are shown in faint style as context.
- The panel resizes smoothly and collapses/reopens without visual glitches.

For flow-level changes, open `deactivate_flow` and `bump_api_version` and verify
that the banner appears above the graph, remains visible in every view filter, and
does not introduce external network references.

For theme behavior, open any rendered fixture and verify:
- `System` follows the OS light/dark preference.
- `Light` and `Dark` switch immediately and remain selected after refresh.
- The canvas, nodes, banners, detail sections, value chips, focus rings, and
  controls remain readable in both light and dark modes.
- Switching themes does not change graph layout, filters, panel resize/collapse,
  or offline behavior.

## FlexiPage outline rendering

`src/flexipage/render-outline.ts` renders a template-agnostic hierarchical
outline instead of an SVG graph. Regions are sections and components are
stacked rows; Facets referenced by component properties are nested beneath the
referencing tab or tabset. Rows carry added, deleted, modified, or unchanged
status classes.

When the after/current template has validated geometry and reconciled slots,
FlexiPage artifacts also include a CSS-grid Wireframe canvas rendered by
`src/flexipage/render-wireframe.ts`, with support for nested stacks, empty
slots, deleted-slot content, removed-region appendices, and unplaced Facets.
The artifact defaults to Wireframe when available and falls back to Outline
for unknown templates or slot mismatches. The Outline/Wireframe selector and
theme control share one right-aligned row, and the selected canvas is retained
in browser storage.

Each Wireframe cell also shows a single change-count pill when any changed item
or region-level type/mode change belongs to that top-level region's breadcrumb
subtree. The pill does not add nested geometry or replace the region's own
status badge. Clicking it opens an in-panel digest grouped by the nearest
human-labeled container in the breadcrumb (falling back to the penultimate
segment when no label is available); unlabeled connector and column segments
are therefore not exposed as group headings. A digest entry reuses the normal
item detail view, including property changes and visibility-rule notes, and a
Back control returns to the digest. The pill stops event propagation, so item
rows in the same cell remain independent click targets and the Outline view is
not involved.

Both products use `src/render/shell.ts` for inline theme controls, four view
filters, the resizable/collapsible detail panel, and the offline document
shell. FlexiPage's `src/flexipage/render-outline.ts` supplies the outline,
wireframe, and generic component/field detail behavior. Clicking a component or
field row renders generic property delta lines and its resolved breadcrumb.
Dynamic Forms property
changes are rendered from structured values, including criterion-level
`visibilityRule` changes; added or removed fields with a rule carry a styled
`has visibility rule` note. Rows retain their breadcrumb in `data-item-path`
for the detail interaction without printing the full ancestry inline. A
template change is promoted to a page-level callout; there is no placeholder
next-steps copy in the generated artifact.

See [flexipage.md](flexipage.md) for the full FlexiPage model, CLI, fixture,
and scope documentation.
