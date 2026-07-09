# Rendering

FlowDelta's renderer turns a `FlowDiff` into a single self-contained HTML
artifact plus the embedded `diff.json` payload. The generated page is fully
offline: CSS, SVG, and client-side JS are all inline, and the browser does not
fetch external assets.

## Flow-level banner

When `FlowDiff.flowChanges` is present, the renderer emits a banner between the
page header and the graph. This is for curated `<Flow>` root attributes such as
`status`, `apiVersion`, and `runInMode`; it is intentionally outside the graph so
Flow elements remain the only graph nodes.

Status changes get a prominent callout. `Active -> Draft` / `Obsolete` /
`InvalidDraft` reads as a deactivation, `Draft` / `Obsolete` -> `Active` reads as
an activation, and other status transitions use a neutral status line. Other
attributes render as labeled before/after rows using the same inserted/deleted
value grammar as the node detail panel. Long values are bounded in the banner so
description changes do not swallow the graph.

The banner is omitted when there are no flow-level changes and for whole-flow
add/delete cases where one side has no header.

## Interactive diff filters

The HTML artifact includes four view presets:

- `All` — the default union view. This matches the original behavior on open.
- `After` — the new topology, with deleted nodes and edges hidden.
- `Before` — the old topology, with added nodes and edges hidden.
- `Changes only` — only added, deleted, and modified nodes plus their incident
  edges.

The filter is client-side only. Clicking a node still opens its delta panel in
every mode.

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
- `src/render/render-html.ts` — HTML shell, filter controls, client-side view
  switching, flow-level banner, and the node detail panel.
- `src/render/section-schemas.ts` — type-specific property grouping schemas.

## Manual smoke

`npm run render:fixtures` writes fixture artifacts to `flow-delta-out/fixtures/`.
For `rewire_connector`, check that `After` and `Before` each read as a coherent
single-state graph and that switching between modes preserves offline behavior.

For the detail panel, open a modified node with complex properties (e.g.,
`modify_decision` or `modify_assignment`) and verify:
- Sections appear with the correct semantic names.
- Tables render columns correctly and unwrap typed values.
- Unchanged sibling columns are shown in faint style as context.
- The panel resizes smoothly and collapses/reopens without visual glitches.

For flow-level changes, open `deactivate_flow` and `bump_api_version` and verify
that the banner appears above the graph, remains visible in every view filter, and
does not introduce external network references.
