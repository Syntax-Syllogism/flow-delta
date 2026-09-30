---
title: Rendering
description: Interactive FlowDelta artifacts, layouts, and detail panels.
---

# Rendering

The renderer turns a `FlowDiff` into one self-contained HTML artifact, with an embedded data payload for the browser. The page works fully offline. CSS, SVG, and client-side JS are all inline, and the browser fetches no external assets.

## As-built snapshots

`buildSnapshotDiff` gives every graph node and edge the status `present` and keeps the current node properties in `after`. `FlowDiff.mode` selects the snapshot renderer path.

Snapshot artifacts:

- hide the diff filters;
- show flow facts without before/after arrows;
- color nodes by element type; and
- end with a provenance footer (source, version, generation time, and FlowDelta version).

The embedded client payload includes each node's type, so the panel badge can name the selected element (for example, Screen) instead of showing a change status.

## Embedded client payload

The HTML embeds one escaped JSON object for browser behavior. It contains:

- semantic node identity, type, label, status, and server-rendered `detailHtml`;
- semantic edge identity, source, target, and status; and
- geometry-only `union`, `after`, and `before` layouts, with their bounds.

The browser doesn't receive raw before/after snapshots or section-schema definitions. Schemas are applied during rendering, and the resulting detail HTML goes into the panel when a node is selected.

The separate `*.diff.json` file (requested with `--json`) is the full machine-readable `FlowDiff`, for CI reporters and debugging. It is not the payload embedded in the HTML.

In snapshot detail panels, `present` nodes are read-only current state. The node's `after` properties show as neutral one-sided values. Semantic sections are available and start open. The panel badge shows the humanized element type instead of a change status.

## Flow-level changes

When `FlowDiff.flowChanges` is present, the renderer floats a small tab over the top-left corner of the canvas. It matches the node panel's collapsed `.panel-reopen` control (same surface, border, radius, and shadow), so the artifact has one disclosure style instead of two.

The tab covers curated `<Flow>` root attributes such as `status`, `apiVersion`, and `runInMode`. It sits outside the graph on purpose, so Flow elements stay the only graph nodes. It reserves no layout row. The canvas and the node-detail panel both start flush under the header, with or without flow-level changes.

Clicking the tab opens a popover anchored at the same corner:

- Status changes get a prominent callout.
  - `Active -> Draft`, `Obsolete`, or `InvalidDraft` reads as a deactivation.
  - `Draft` or `Obsolete` -> `Active` reads as an activation.
  - Any other status transition gets a neutral status line.
  - The tab label and its dot color use the same classification, before the popover is opened.
- Other attributes appear as labeled before/after rows, using the same inserted/deleted value style as the node detail panel.
- The popover closes on an outside click, on Escape, or when you select a node. Node clicks stop propagation for their own panel logic, so closing the popover is handled explicitly, not through bubbling to `document`.

The tab is omitted when there are no flow-level changes, and for whole-flow add or delete cases where one side has no header.

## Interactive diff filters

The HTML artifact has four view presets:

- `All`: the default union view.
- `After`: the new topology, with deleted nodes and edges hidden.
- `Before`: the old topology, with added nodes and edges hidden.
- `Changes only`: added, deleted, and modified nodes, plus their incident edges.

Filtering happens in the browser only. Clicking a node, or activating it with the keyboard, still opens its detail panel. Snapshot artifacts omit these filters.

## Theme control

The header has a compact `System / Light / Dark` control. `System` is the default and follows the reviewer's OS color preference through `prefers-color-scheme`. `Light` and `Dark` are explicit overrides.

The choice is stored in the browser only, in `localStorage` under `flow-delta-theme`. Missing, invalid, or inaccessible storage falls back to `System`. The bootstrap script, CSS, and controls are all inline, so the artifact stays offline.

`src/render/shell.ts` is the shared artifact shell. It owns the theme bootstrap, theme buttons, persistence, and the common filter and panel chrome for both FlowDelta and FlexiPageDelta. Each renderer supplies only its canvas content, product-specific styles, panel content, and client behavior.

## Layout strategy

`src/render/layout.ts` bakes three ELK layouts at CLI time:

- `union`: the full graph.
- `after`: the after-state subgraph.
- `before`: the before-state subgraph.

`Changes only` reuses the `union` geometry and hides unchanged nodes and edges in the browser. The browser never reruns ELK.

The renderer recomputes the active viewBox from the visible geometry, so the canvas stays centered on the selected view. This keeps `After` and `Before` readable and avoids dangling edges to hidden nodes.

## Node detail panel

Clicking a node opens a right-side panel that groups its property changes into semantic sections. You can **resize** the panel by dragging its left edge, and **collapse** it with the toggle button.

### Section schemas

Type-specific section schemas in `src/render/section-schemas.ts` decide how changes are grouped. Each schema declares:

- **`name`**: the section header (for example "Outcomes" or "Field Mappings").
- **`paths`**: the top-level property keys the section owns (for example `["rules"]` for decision outcomes).
- **`render`**: one of
  - `"lines"`: labeled scalar changes (the default fallback);
  - `"table"`: array items as rows, with semantic columns; or
  - `"grouped-table"`: nested structure, with a header per group and an inner table in each.

**Examples:**

- **Decision nodes** get an "Outcomes" grouped-table. Each outcome is a group, labeled by rule name. Its conditions are a table with `Resource`, `Operator`, and `Value` columns.
- **Record Create/Update** get a "Field Mappings" table with `Field` and `Value` columns.
- **Record Lookup/Delete** get a "Filters" table with `Field`, `Operator`, and `Value` columns.

### Rendering behavior

**Modified nodes** show property changes with before/after context.

- If only one column changed in a table row, the unchanged sibling columns appear in a faint style for context.
- Typed wrappers (for example `{ booleanValue: "true" }`) are unwrapped to their scalar value.
- String diffs read like a git diff: `+` (green) for additions, `−` (red, struck through) for deletions, and faint for unchanged text.

**Added nodes** show the placeholder `"This node was added in the new version."`

**Deleted nodes** show the placeholder `"This node was deleted from the previous version."`

### Fallback grouping

Changes that match no section schema are grouped by:

1. Array name, if the change path is array-indexed. For example, changes to `myItems[0].field` go under `"myItems"`.
2. A generic `"Configuration"` bucket for unstructured scalars.

## Key code paths

- `src/render/layout.ts`: layout baking and bounds measurement.
- `src/render/artifact-client-data.ts`: the browser data boundary. Semantic node and edge data, pre-rendered detail HTML, and geometry-only baked views.
- `src/render/shell.ts`: the shared offline document shell, theme persistence, filter dispatch, panel chrome, and optional Outline/Wireframe switching.
- `src/render/render-html.ts`: the Flow SVG canvas, client-side graph and filter behavior, the flow-level banner, and semantic node detail content.
- `src/render/section-schemas.ts`: type-specific property grouping schemas.

## Manual smoke

`npm run render:fixtures -- flow` writes Flow fixture artifacts to `flow-delta-out/fixtures/`. `npm run render:fixtures -- flexipage` writes FlexiPage artifacts to `flexipage-delta-out/fixtures/`. With no argument, it renders both.

For `rewire_connector`, check that `After` and `Before` each read as a coherent single-state graph, and that switching modes keeps the artifact offline.

**Detail panel.** Open a modified node with complex properties (for example `modify_decision` or `modify_assignment`) and check that:

- sections have the right semantic names;
- tables render their columns and unwrap typed values;
- unchanged sibling columns appear faint, as context; and
- the panel resizes smoothly and collapses and reopens without visual glitches.

**Flow-level changes.** Open `deactivate_flow` and `bump_api_version` and check that the banner appears above the graph, stays visible in every view filter, and adds no external network references.

**Theme.** Open any rendered fixture and check that:

- `System` follows the OS light/dark preference;
- `Light` and `Dark` switch immediately and stay selected after a refresh;
- the canvas, nodes, banners, detail sections, value chips, focus rings, and controls stay readable in both modes; and
- switching themes doesn't change graph layout, filters, panel resize and collapse, or offline behavior.

## FlexiPage outline rendering

`src/flexipage/render-outline.ts` renders a template-agnostic, hierarchical outline instead of an SVG graph. Regions are sections and components are stacked rows. Facets referenced by component properties nest under the tab or tabset that references them. Rows carry an added, deleted, modified, or unchanged status class.

### Wireframe

When the after (current) template has validated geometry and reconciled slots, FlexiPage artifacts also include a CSS-grid Wireframe canvas from `src/flexipage/render-wireframe.ts`. It supports nested stacks, empty slots, deleted-slot content, removed-region appendices, and unplaced Facets.

The artifact defaults to Wireframe when it's available. It falls back to Outline for unknown templates or slot mismatches. The Outline/Wireframe selector and the theme control share one right-aligned row. The selected canvas is kept in browser storage.

### Change-count pills

A Wireframe cell shows a single change-count pill when any changed item, or a region-level type or mode change, belongs to that top-level region's breadcrumb subtree. The pill adds no nested geometry and doesn't replace the region's own status badge.

Clicking the pill opens an in-panel digest. The digest groups entries by the nearest human-labeled container in the breadcrumb. If there's no label, it uses the penultimate segment. Unlabeled connector and column segments are never shown as group headings.

A digest entry reuses the normal item detail view, including property changes and visibility-rule notes. A Back control returns to the digest. The pill stops event propagation, so item rows in the same cell stay independent click targets, and the Outline view is not involved.

### Shared shell and component schemas

Both products use `src/render/shell.ts` for inline theme controls, four view filters, the resizable and collapsible detail panel, and the offline document shell. FlexiPage's `src/flexipage/render-outline.ts` supplies the outline, the wireframe, and the component and field detail behavior.

`src/flexipage/component-schemas.ts` is a registry that gives high-signal component types friendly titles and grouped property labels.

- Unknown components keep generic property delta lines.
- Uncovered properties on known components appear under `Other`, with `humanizePath` labels.
- Schema enrichment is presentation-only. The `PageDiff` model and the emitted `*.diff.json` stay semantic data, with no render fields.

Clicking a component or field row also shows its resolved breadcrumb. Rows keep their breadcrumb in `data-item-path` for the detail interaction, without printing the full ancestry inline.

Dynamic Forms property changes are rendered from structured values, including criterion-level `visibilityRule` changes. Added or removed fields with a rule carry a styled `has visibility rule` note.

A template change is promoted to a page-level callout. The generated artifact has no placeholder next-steps copy.

See [flexipage.md](flexipage.md) for the full FlexiPage model, CLI, fixture, and scope documentation.
