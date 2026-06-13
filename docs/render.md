# Rendering

FlowDelta's renderer turns a `FlowDiff` into a single self-contained HTML
artifact plus the embedded `diff.json` payload. The generated page is fully
offline: CSS, SVG, and client-side JS are all inline, and the browser does not
fetch external assets.

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

## Key code paths

- `src/render/layout.ts` — layout baking and bounds measurement.
- `src/render/render-html.ts` — HTML shell, filter controls, client-side view
  switching, and the node detail panel.

## Manual smoke

`npm run render:fixtures` writes fixture artifacts to `flow-delta-out/fixtures/`.
For `rewire_connector`, check that `After` and `Before` each read as a coherent
single-state graph and that switching between modes preserves offline behavior.
