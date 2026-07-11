import type { LayoutedFlow } from "./layout.ts";
import { getSectionSchemas } from "./section-schemas.ts";
import { humanizePath, snapshotPanelClientScript } from "./snapshot-panel.ts";

export const THEME_STORAGE_KEY = "flow-delta-theme";

export function renderHtml(layout: LayoutedFlow): string {
  const data = {
    diff: layout.diff,
    nodes: layout.nodes,
    edges: layout.edges,
    width: layout.width,
    height: layout.height,
    layouts: layout.views,
    sectionSchemas: Object.fromEntries(layout.diff.nodes.map((node) => [node.type, getSectionSchemas(node.type)])),
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const s = layout.diff.summary;
  const stat = (n: number, kind: string, word: string) =>
    `<span class="stat ${kind}${n === 0 ? " zero" : ""}">${n} ${word}</span>`;
  const edgeStat = s.addedEdges + s.removedEdges > 0
    ? `<span class="sep">·</span><span class="stat edges">+${s.addedEdges}/−${s.removedEdges} edges</span>`
    : "";
  const metaHtml = `${stat(s.addedNodes, "added", "added")}<span class="sep">·</span>`
    + `${stat(s.removedNodes, "deleted", "deleted")}<span class="sep">·</span>`
    + `${stat(s.modifiedNodes, "modified", "modified")}${edgeStat}`;
  const viewBox = fitViewBox(layout.width, layout.height);
  const flowBannerHtml = renderFlowBanner(layout.diff.flowChanges);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(layout.diff.flowName)}</title>
  <script>
    (() => {
      const key = ${JSON.stringify(THEME_STORAGE_KEY)};
      const allowed = new Set(["system", "light", "dark"]);
      let theme = "system";
      try {
        const stored = localStorage.getItem(key);
        if (allowed.has(stored)) theme = stored;
      } catch {}
      document.documentElement.dataset.theme = theme;
    })();
  </script>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      --bg: #f5f7fb; --surface: #ffffff; --surface-muted: #f8fafc; --surface-subtle: #fbfcfe; --surface-selected: #eff6ff; --border: #e3e8ef; --focus: #93c5fd;
      --text: #1f2937; --muted: #64748b; --faint: #94a3b8;
      --node-text: #111827; --shadow: rgba(15, 23, 42, 0.12); --shadow-strong: rgba(15, 23, 42, 0.2);
      --grid-dot: #dfe5ee; --canvas-start: #ffffff; --canvas-end: #f7f9fc;
      --added: #16a34a; --added-fill: #dcfce7;
      --deleted: #dc2626; --deleted-fill: #fee2e2;
      --modified: #d97706; --modified-fill: #fef3c7;
      --unchanged: #94a3b8; --unchanged-fill: #e9edf3;
      --edge: #64748b; --fault: #7c3aed;
      --inserted-text: #14532d; --deleted-text: #7f1d1d; --deleted-line: rgba(127, 29, 29, 0.5);
      --panel-width: 34vw;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        color-scheme: dark;
        --bg: #0f172a; --surface: #111827; --surface-muted: #1f2937; --surface-subtle: #172033; --surface-selected: #1e3a5f; --border: #334155; --focus: #60a5fa;
        --text: #e5e7eb; --muted: #a5b4c7; --faint: #718096;
        --node-text: #f8fafc; --shadow: rgba(0, 0, 0, 0.35); --shadow-strong: rgba(0, 0, 0, 0.55);
        --grid-dot: #334155; --canvas-start: #0f172a; --canvas-end: #111827;
        --added: #4ade80; --added-fill: #123f2a;
        --deleted: #f87171; --deleted-fill: #4a1d23;
        --modified: #fbbf24; --modified-fill: #46330d;
        --unchanged: #64748b; --unchanged-fill: #263241;
        --edge: #94a3b8; --fault: #c4b5fd;
        --inserted-text: #bbf7d0; --deleted-text: #fecaca; --deleted-line: rgba(254, 202, 202, 0.55);
      }
    }
    :root[data-theme="light"] {
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0f172a; --surface: #111827; --surface-muted: #1f2937; --surface-subtle: #172033; --surface-selected: #1e3a5f; --border: #334155; --focus: #60a5fa;
      --text: #e5e7eb; --muted: #a5b4c7; --faint: #718096;
      --node-text: #f8fafc; --shadow: rgba(0, 0, 0, 0.35); --shadow-strong: rgba(0, 0, 0, 0.55);
      --grid-dot: #334155; --canvas-start: #0f172a; --canvas-end: #111827;
      --added: #4ade80; --added-fill: #123f2a;
      --deleted: #f87171; --deleted-fill: #4a1d23;
      --modified: #fbbf24; --modified-fill: #46330d;
      --unchanged: #64748b; --unchanged-fill: #263241;
      --edge: #94a3b8; --fault: #c4b5fd;
      --inserted-text: #bbf7d0; --deleted-text: #fecaca; --deleted-line: rgba(254, 202, 202, 0.55);
    }
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; display: grid; grid-template-rows: auto 1fr; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.45; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
    header h1 { margin: 0 0 2px; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
    header .meta { font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 8px; }
    header .meta .stat { font-variant-numeric: tabular-nums; }
    header .meta .stat.zero { color: var(--faint); }
    header .meta .added:not(.zero) { color: var(--added); }
    header .meta .deleted:not(.zero) { color: var(--deleted); }
    header .meta .modified:not(.zero) { color: var(--modified); }
    header .meta .sep { color: var(--border); }
    .header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .filters button {
      border: 1px solid var(--border);
      background: var(--surface-muted);
      color: var(--muted);
      padding: 6px 11px;
      border-radius: 999px;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
    }
    .filters button.active {
      background: var(--surface-selected);
      border-color: var(--focus);
      color: var(--text);
      box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12);
    }
    .filters button:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .theme-toggle { display: inline-flex; padding: 2px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-muted); }
    .theme-toggle button { border: 0; border-radius: 999px; background: transparent; color: var(--muted); padding: 4px 9px; font: inherit; font-size: 11.5px; font-weight: 650; cursor: pointer; }
    .theme-toggle button[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px var(--shadow); }
    .theme-toggle button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .legend { display: flex; gap: 14px; font-size: 12px; flex-wrap: wrap; color: var(--muted); }
    .legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: 0; }
    .legend .added::before { background: var(--added); }
    .legend .deleted::before { background: var(--deleted); }
    .legend .modified::before { background: var(--modified); }
    .legend .unchanged::before { background: var(--unchanged); }
    main { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) clamp(300px, var(--panel-width), 70vw); min-height: 0; }
    body.panel-collapsed main { grid-template-columns: minmax(0, 1fr) 0; }
    .canvas { position: relative; overflow: hidden; }
    svg {
      width: 100%; height: 100%; display: block;
      background:
        radial-gradient(circle, var(--grid-dot) 1px, transparent 1.4px) -11px -11px / 22px 22px,
        linear-gradient(var(--canvas-start), var(--canvas-end));
    }
    .panel { position: relative; min-width: 0; border-left: 1px solid var(--border); background: var(--surface); padding: 20px; overflow-y: auto; overflow-x: hidden; }
    body.panel-collapsed .panel { padding: 0; border-left: 0; overflow: hidden; }
    body.panel-collapsed .panel > *:not(.panel-resizer) { display: none; }
    /* drag-to-resize handle on the panel's left edge */
    .panel-resizer { position: absolute; left: 0; top: 0; bottom: 0; width: 9px; transform: translateX(-50%); cursor: col-resize; z-index: 6; touch-action: none; }
    .panel-resizer::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--border); transform: translateX(-50%); transition: background-color 0.12s ease, width 0.12s ease; }
    .panel-resizer:hover::before, .panel-resizer.dragging::before { background: var(--focus); width: 3px; }
    body.panel-collapsed .panel-resizer { display: none; }
    .panel-head { display: flex; align-items: flex-start; gap: 8px; }
    .panel-head h2 { flex: 1; min-width: 0; }
    .panel-toggle, .panel-reopen { border: 1px solid var(--border); background: var(--surface-muted); color: var(--muted); border-radius: 7px; cursor: pointer; font: inherit; line-height: 1; }
    .panel-toggle { flex: none; width: 26px; height: 26px; font-size: 16px; display: grid; place-items: center; }
    .panel-toggle:hover, .panel-reopen:hover { color: var(--text); border-color: var(--focus); background: var(--surface-selected); }
    .panel-toggle:focus-visible, .panel-reopen:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* floating tab to reopen the panel once collapsed */
    .panel-reopen { display: none; position: absolute; top: 14px; right: 14px; z-index: 7; padding: 7px 12px; font-size: 12px; font-weight: 600; box-shadow: 0 1px 3px var(--shadow); }
    body.panel-collapsed .panel-reopen { display: inline-flex; align-items: center; gap: 6px; }
    .panel h2 { margin: 0 0 8px; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
    .panel .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; background: var(--unchanged-fill); color: var(--muted); margin-bottom: 16px; }
    .panel.added .badge { background: var(--added-fill); color: var(--added); }
    .panel.deleted .badge { background: var(--deleted-fill); color: var(--deleted); }
    .panel.modified .badge { background: var(--modified-fill); color: var(--modified); }
    .panel .empty { color: var(--muted); font-size: 13px; }
    .detail-section { margin: 0 0 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-subtle); overflow: hidden; }
    .detail-section.snapshot-section { border-left-width: 3px; }
    .detail-section.snapshot-section.added { border-left-color: rgba(22, 163, 74, 0.5); }
    .detail-section.snapshot-section.deleted { border-left-color: rgba(220, 38, 38, 0.45); }
    .detail-section.snapshot-section.added summary { background: rgba(220, 252, 231, 0.35); }
    .detail-section.snapshot-section.deleted summary { background: rgba(254, 226, 226, 0.35); }
    .detail-section summary { cursor: pointer; padding: 11px 13px; font-weight: 650; }
    .detail-section[open] summary { border-bottom: 1px solid var(--border); }
    .section-count { color: var(--muted); font-size: 11px; font-weight: 500; }
    .section-body { padding: 12px; overflow-x: auto; }
    .change-kind { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
    .change-kind.added { color: var(--added); background: var(--added-fill); }
    .change-kind.modified { color: var(--modified); background: var(--modified-fill); }
    .change-kind.removed { color: var(--deleted); background: var(--deleted-fill); }
    /* git-diff value grammar */
    .val { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px; border-radius: 4px; padding: 1px 5px; overflow-wrap: anywhere; }
    .val.ins { color: var(--inserted-text); background: var(--added-fill); }
    .val.del { color: var(--deleted-text); background: var(--deleted-fill); text-decoration: line-through; text-decoration-color: var(--deleted-line); }
    .val.faint { color: var(--muted); background: transparent; padding-left: 0; }
    .val.one-sided { color: var(--text); background: transparent; padding-left: 0; }
    .val em { font-style: normal; color: var(--faint); }
    .val pre { margin: 4px 0 0; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11.5px; line-height: 1.5; max-height: 220px; overflow: auto; }
    .arrow { color: var(--faint); margin: 0 2px; }
    /* scalar / fallback change lines */
    .changes { list-style: none; padding: 0; margin: 0; }
    .changes li { min-width: 0; margin-bottom: 9px; }
    .changes li:last-child { margin-bottom: 0; }
    .change-line-head { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
    .change-line-label { font-weight: 600; font-size: 12px; }
    .change-line-value { padding-left: 2px; }
    /* item tables (field mappings, conditions, filters, parameters) */
    .change-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .change-table th, .change-table td { padding: 7px 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    .change-table th { color: var(--muted); font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; }
    .change-table tr:last-child td { border-bottom: 0; }
    .change-table .row-idx { color: var(--faint); font-variant-numeric: tabular-nums; width: 1%; white-space: nowrap; }
    .change-table tr.row-added { background: rgba(22, 163, 74, 0.06); }
    .change-table tr.row-removed { background: rgba(220, 38, 38, 0.05); }
    .snapshot-kv { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; }
    .snapshot-kv th, .snapshot-kv td { padding: 6px 7px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    .snapshot-kv th { color: var(--muted); width: 34%; font-weight: 650; }
    .snapshot-kv tr:last-child th, .snapshot-kv tr:last-child td { border-bottom: 0; }
    .snapshot-nested { border-left: 2px solid var(--border); padding-left: 10px; margin: 10px 0; }
    .snapshot-nested-title { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 7px; }
    .snapshot-card { border: 1px dashed var(--border); border-radius: 7px; padding: 9px 10px; margin: 8px 0; background: var(--surface); }
    .snapshot-card.added { border-left: 2px solid rgba(22, 163, 74, 0.5); }
    .snapshot-card.removed { border-left: 2px solid rgba(220, 38, 38, 0.45); }
    .snapshot-card-title { font-size: 12px; font-weight: 700; margin-bottom: 7px; overflow-wrap: anywhere; }
    /* outcome groups (decisions) */
    .outcome-group { margin-bottom: 12px; padding: 10px 11px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); }
    .outcome-group:last-child { margin-bottom: 0; }
    .group-head { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
    .group-label { font-weight: 700; font-size: 12.5px; }
    .outcome-group .changes { margin-bottom: 8px; }
    /* Flow-level changes: a floating tab over the canvas's top-left corner,
       styled to match .panel-reopen's collapsed-state language (same surface,
       border, radius, shadow) so there's one disclosure idiom in the artifact
       instead of two. It reserves no layout row. */
    .flow-tab {
      position: absolute; top: 14px; left: 14px; z-index: 6;
      display: inline-flex; align-items: center; gap: 7px;
      border: 1px solid var(--border); background: var(--surface-muted); color: var(--muted);
      border-radius: 7px; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; line-height: 1;
      box-shadow: 0 1px 3px var(--shadow); cursor: pointer;
    }
    .flow-tab:hover { color: var(--text); border-color: var(--focus); background: var(--surface-selected); }
    .flow-tab:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .flow-tab .flow-tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--modified); flex: none; }
    .flow-tab.deactivated .flow-tab-dot { background: var(--deleted); }
    .flow-tab.activated .flow-tab-dot { background: var(--added); }
    .flow-tab .flow-tab-chev { font-size: 9px; opacity: 0.75; transition: transform 0.12s ease; }
    .flow-tab[aria-expanded="true"] .flow-tab-chev { transform: rotate(180deg); }
    .flow-popover {
      position: absolute; top: 14px; left: 14px; z-index: 6; width: min(300px, calc(100% - 28px));
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      box-shadow: 0 16px 40px -12px var(--shadow-strong); overflow: hidden;
    }
    .flow-popover[hidden] { display: none; }
    .flow-popover-head { padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--surface-muted); font-size: 12px; font-weight: 650; }
    .flow-popover-body { padding: 12px; max-height: 60vh; overflow: auto; }
    .flow-banner-callout { margin-bottom: 8px; font-weight: 750; }
    .flow-banner-callout.deactivated { color: var(--deleted); }
    .flow-banner-callout.activated { color: var(--added); }
    .flow-banner-callout.neutral { color: var(--modified); }
    .flow-banner-list { display: grid; gap: 7px; }
    .flow-change-row { display: grid; grid-template-columns: minmax(90px, 120px) minmax(0, 1fr); align-items: start; gap: 10px; }
    .flow-change-row + .flow-change-row { margin-top: 7px; }
    .flow-change-label { color: var(--muted); font-size: 12px; font-weight: 700; }
    .flow-change-value { min-width: 0; max-height: 180px; overflow: auto; }
    .edge { fill: none; }
    .edge.unchanged { stroke-width: 1.4; opacity: 0.55; }
    .edge.normal.unchanged { stroke: var(--edge); marker-end: url(#arrow-normal); }
    .edge.fault.unchanged { stroke: var(--fault); stroke-dasharray: 6 4; marker-end: url(#arrow-fault); }
    .edge.added { stroke: var(--added); stroke-width: 3; marker-end: url(#arrow-added); }
    .edge.deleted { stroke: var(--deleted); stroke-width: 2; stroke-dasharray: 7 5; marker-end: url(#arrow-deleted); }
    #arrow-normal path { fill: var(--edge); }
    #arrow-fault path { fill: var(--fault); }
    #arrow-added path { fill: var(--added); }
    #arrow-deleted path { fill: var(--deleted); }
    .node rect { rx: 11; ry: 11; stroke-width: 1.75; filter: drop-shadow(0 1px 2px var(--shadow)); }
    .node { cursor: pointer; }
    .node text { font-size: 12px; fill: var(--node-text); pointer-events: none; }
    .node.added rect { fill: var(--added-fill); stroke: var(--added); }
    .node.deleted rect { fill: var(--deleted-fill); stroke: var(--deleted); }
    .node.modified rect { fill: var(--modified-fill); stroke: var(--modified); }
    .node.unchanged rect { fill: var(--unchanged-fill); stroke: var(--unchanged); }
    .node.selected rect { stroke-width: 3; filter: drop-shadow(0 2px 6px var(--shadow-strong)); }
    .node-label { white-space: pre; }
    /* Type-based styling — SHAPE & stroke pattern only. Status (added/deleted/
       modified/unchanged) remains the sole authority on fill/stroke COLOR, so
       the legend stays reliable. Start/end stand out via a pill shape, heavier
       stroke, and a neutral emphasis halo — never via a status-like color. */
    .node.type-start rect, .node.type-end rect { rx: 24; ry: 24; stroke-width: 2.5; filter: drop-shadow(0 0 0 3px var(--shadow)) drop-shadow(0 1px 3px var(--shadow-strong)); }
    .node.type-recordLookup rect, .node.type-recordCreate rect, .node.type-recordUpdate rect, .node.type-recordDelete rect { rx: 4; ry: 4; }
    .node.type-screen rect { rx: 6; ry: 6; }
    .node.type-subflow rect { stroke-width: 2.5; }
    .node.type-loop rect { stroke-dasharray: 2 3; }
    .node.type-wait rect { stroke-dasharray: 4 4; }
    .node.selected.type-start rect, .node.selected.type-end rect { stroke-width: 3.5; filter: drop-shadow(0 0 0 5px var(--shadow-strong)) drop-shadow(0 2px 6px var(--shadow-strong)); }
    @media (max-width: 1000px) {
      .panel { padding: 16px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(layout.diff.flowName)}</h1>
      <div class="meta">${metaHtml}</div>
    </div>
    <div class="header-actions">
      <div class="theme-toggle" role="group" aria-label="Color theme">
        <button type="button" data-theme-choice="system" aria-pressed="true">System</button>
        <button type="button" data-theme-choice="light" aria-pressed="false">Light</button>
        <button type="button" data-theme-choice="dark" aria-pressed="false">Dark</button>
      </div>
      <div class="filters" role="group" aria-label="Diff view filters">
        <button type="button" class="active" data-view-mode="all">All</button>
        <button type="button" data-view-mode="after">After</button>
        <button type="button" data-view-mode="before">Before</button>
        <button type="button" data-view-mode="changes">Changes only</button>
      </div>
      <div class="legend">
        <span class="added">Added</span>
        <span class="deleted">Deleted</span>
        <span class="modified">Modified</span>
        <span class="unchanged">Unchanged</span>
      </div>
    </div>
  </header>
  <main>
    <div class="canvas">
      ${flowBannerHtml}
      <svg id="flow-svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Flow diff">
        <defs>
          <marker id="arrow-normal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L8,4 L0,8 Z"></path>
          </marker>
          <marker id="arrow-fault" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L8,4 L0,8 Z"></path>
          </marker>
          <marker id="arrow-added" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L8,4 L0,8 Z"></path>
          </marker>
          <marker id="arrow-deleted" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L8,4 L0,8 Z"></path>
          </marker>
        </defs>
        <g id="viewport">
          ${layout.edges.map(renderEdge).join("")}
          ${layout.nodes.map(renderNode).join("")}
        </g>
      </svg>
    </div>
    <aside class="panel">
      <div class="panel-resizer" id="panel-resizer" role="separator" aria-orientation="vertical" aria-label="Resize panel"></div>
      <div class="panel-head">
        <h2 id="panel-title">Select a node</h2>
        <button type="button" id="panel-toggle" class="panel-toggle" aria-label="Collapse panel" title="Collapse panel">›</button>
      </div>
      <div id="panel-badge" class="badge">No selection</div>
      <div id="panel-body">Click a node to inspect its properties.</div>
    </aside>
    <button type="button" id="panel-reopen" class="panel-reopen" aria-label="Show details panel" title="Show details">‹ Details</button>
  </main>
  <script>
    const DATA = ${json};
    const svg = document.getElementById("flow-svg");
    const viewport = document.getElementById("viewport");
    const panel = document.querySelector(".panel");
    const panelTitle = document.getElementById("panel-title");
    const panelBadge = document.getElementById("panel-badge");
    const panelBody = document.getElementById("panel-body");
    const filterButtons = [...document.querySelectorAll(".filters button")];
    const themeButtons = [...document.querySelectorAll(".theme-toggle button")];
    const nodesById = new Map(DATA.nodes.map((node) => [node.id, node]));
    const nodeElements = new Map([...document.querySelectorAll(".node")].map((node) => [node.dataset.nodeId, node]));
    const edgeElements = new Map([...document.querySelectorAll(".edge")].map((edge) => [edge.dataset.edgeId, edge]));
    const flowTab = document.getElementById("flow-tab");
    const flowPopover = document.getElementById("flow-popover");
    function closeFlowPopover() {
      if (!flowTab || !flowPopover || flowPopover.hidden) return;
      flowTab.setAttribute("aria-expanded", "false");
      flowPopover.hidden = true;
    }
    let viewBox = svg.viewBox.baseVal;
    let dragStart = null;
    let selectedNodeId = null;
    const THEME_STORAGE_KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
    const VALID_THEMES = new Set(["system", "light", "dark"]);

    function readStoredTheme() {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return VALID_THEMES.has(stored) ? stored : "system";
      } catch {
        return "system";
      }
    }

    function persistTheme(theme) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {}
    }

    function applyTheme(theme) {
      const next = VALID_THEMES.has(theme) ? theme : "system";
      document.documentElement.dataset.theme = next;
      themeButtons.forEach((button) => {
        const active = button.dataset.themeChoice === next;
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function isNodeVisible(node, mode) {
      if (mode === "after") return node.status !== "deleted";
      if (mode === "before") return node.status !== "added";
      if (mode === "changes") return node.status !== "unchanged";
      return true;
    }

    function isEdgeVisible(edge, mode, visibleNodeIds) {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
        return false;
      }
      if (mode === "after") return edge.status !== "deleted";
      if (mode === "before") return edge.status !== "added";
      if (mode === "changes") {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);
        const sourceChanged = source?.status !== "unchanged";
        const targetChanged = target?.status !== "unchanged";
        return edge.status !== "unchanged" || (sourceChanged && targetChanged);
      }
      return true;
    }

    function edgePath(sections) {
      const points = sections.flatMap((section, index) => {
        const start = index === 0 ? [section.startPoint] : [];
        const bends = section.bendPoints ?? [];
        const end = [section.endPoint];
        return [...start, ...bends, ...end];
      });
      if (points.length === 0) {
        return "";
      }
      return points.map((point, index) => \`\${index === 0 ? "M" : "L"} \${point.x} \${point.y}\`).join(" ");
    }

    function updateToolbar(mode) {
      filterButtons.forEach((button) => {
        const active = button.dataset.viewMode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function round(value) {
      return Math.round(value * 100) / 100;
    }

    function collectEdgePoints(sections) {
      return sections.flatMap((section, index) => {
        const start = index === 0 ? [section.startPoint] : [];
        const bends = section.bendPoints ?? [];
        const end = [section.endPoint];
        return [...start, ...bends, ...end];
      });
    }

    function measureVisibleBounds(nodes, edges) {
      const points = [
        ...nodes.flatMap((node) => ([
          { x: node.x, y: node.y },
          { x: node.x + node.width, y: node.y + node.height },
        ])),
        ...edges.flatMap((edge) => collectEdgePoints(edge.sections)),
      ];

      if (points.length === 0) {
        return null;
      }

      let minX = points[0].x;
      let minY = points[0].y;
      let maxX = points[0].x;
      let maxY = points[0].y;
      for (const point of points.slice(1)) {
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
      }

      return {
        x: minX - 20,
        y: minY - 20,
        width: (maxX - minX) + 40,
        height: (maxY - minY) + 40,
      };
    }

    function fitViewBoxRect(bounds) {
      const minWidth = 720;
      const minHeight = 540;
      const width = Math.max(bounds.width, minWidth);
      const height = Math.max(bounds.height, minHeight);
      const x = bounds.x + (bounds.width - width) / 2;
      const y = bounds.y + (bounds.height - height) / 2;
      return {
        x: round(x),
        y: round(y),
        width: round(width),
        height: round(height),
      };
    }

    function updateViewBox(bounds) {
      const box = fitViewBoxRect(bounds);
      viewBox.x = box.x;
      viewBox.y = box.y;
      viewBox.width = box.width;
      viewBox.height = box.height;
    }

    function clearSelection(message) {
      selectedNodeId = null;
      document.querySelectorAll(".node").forEach((el) => el.classList.remove("selected"));
      panel.className = "panel";
      panelTitle.textContent = "No visible nodes";
      panelBadge.textContent = "Hidden";
      panelBody.innerHTML = "<div class='empty'>" + escapeHtml(message) + "</div>";
    }

    function updatePanel(node) {
      panel.className = "panel " + node.status;
      panelTitle.textContent = node.label;
      panelBadge.textContent = node.status.toUpperCase();
      panelBody.innerHTML = renderNodePanelBody(node, DATA.sectionSchemas[node.type] || []);
    }

    ${snapshotPanelClientScript()}

    function selectNode(id) {
      selectedNodeId = id;
      document.querySelectorAll(".node").forEach((el) => el.classList.remove("selected"));
      const selected = document.querySelector(\`.node[data-node-id="\${CSS.escape(id)}"]\`);
      if (selected) selected.classList.add("selected");
      const node = nodesById.get(id);
      if (node) updatePanel(node);
    }

    function pickInitialNode(visibleNodeIds) {
      return DATA.nodes.find((node) => visibleNodeIds.has(node.id) && node.status === "modified")
        || DATA.nodes.find((node) => visibleNodeIds.has(node.id) && node.status !== "unchanged")
        || DATA.nodes.find((node) => visibleNodeIds.has(node.id))
        || null;
    }

    function applyView(mode) {
      const layout = mode === "all" || mode === "changes"
        ? DATA.layouts.union
        : DATA.layouts[mode];
      const nodeLayout = new Map(layout.nodes.map((node) => [node.id, node]));
      const edgeLayout = new Map(layout.edges.map((edge) => [edge.id, edge]));
      const visibleNodeIds = new Set();
      const visibleNodes = [];
      const visibleEdges = [];

      DATA.nodes.forEach((node) => {
        const element = nodeElements.get(node.id);
        if (!element) return;
        if (!isNodeVisible(node, mode)) {
          element.style.display = "none";
          return;
        }
        const positioned = nodeLayout.get(node.id);
        if (!positioned) {
          element.style.display = "none";
          return;
        }
        element.style.display = "";
        element.setAttribute("transform", "translate(" + positioned.x + "," + positioned.y + ")");
        visibleNodeIds.add(node.id);
        visibleNodes.push(positioned);
      });

      DATA.edges.forEach((edge) => {
        const element = edgeElements.get(edge.id);
        if (!element) return;
        if (!isEdgeVisible(edge, mode, visibleNodeIds)) {
          element.style.display = "none";
          return;
        }
        const positioned = edgeLayout.get(edge.id);
        if (!positioned) {
          element.style.display = "none";
          return;
        }
        element.style.display = "";
        element.setAttribute("d", edgePath(positioned.sections));
        visibleEdges.push(positioned);
      });

      updateToolbar(mode);
      updateViewBox(measureVisibleBounds(visibleNodes, visibleEdges) || { x: 0, y: 0, width: layout.width, height: layout.height });

      if (selectedNodeId && visibleNodeIds.has(selectedNodeId)) {
        const node = nodesById.get(selectedNodeId);
        if (node) {
          updatePanel(node);
        }
        return;
      }

      const initialNode = pickInitialNode(visibleNodeIds);
      if (initialNode) {
        selectNode(initialNode.id);
      } else {
        clearSelection("This view has no visible nodes.");
      }
    }

    document.querySelectorAll(".node").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        closeFlowPopover();
        selectNode(node.dataset.nodeId);
      });
    });

    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const scale = event.deltaY < 0 ? 0.9 : 1.1;
      const rect = svg.getBoundingClientRect();
      const mx = viewBox.x + (event.clientX - rect.left) * (viewBox.width / rect.width);
      const my = viewBox.y + (event.clientY - rect.top) * (viewBox.height / rect.height);
      viewBox.x = mx - (mx - viewBox.x) * scale;
      viewBox.y = my - (my - viewBox.y) * scale;
      viewBox.width *= scale;
      viewBox.height *= scale;
    }, { passive: false });

    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".node")) return;
      dragStart = { x: event.clientX, y: event.clientY, viewBox: { x: viewBox.x, y: viewBox.y } };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!dragStart) return;
      const rect = svg.getBoundingClientRect();
      const dx = (event.clientX - dragStart.x) * (viewBox.width / rect.width);
      const dy = (event.clientY - dragStart.y) * (viewBox.height / rect.height);
      viewBox.x = dragStart.viewBox.x - dx;
      viewBox.y = dragStart.viewBox.y - dy;
    });
    svg.addEventListener("pointerup", () => { dragStart = null; });
    svg.addEventListener("pointercancel", () => { dragStart = null; });

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        applyView(button.dataset.viewMode);
      });
    });

    themeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const theme = button.dataset.themeChoice;
        applyTheme(theme);
        persistTheme(theme);
      });
    });

    // Panel: collapse to focus on the canvas, and drag the left edge to resize.
    const panelToggle = document.getElementById("panel-toggle");
    const panelReopen = document.getElementById("panel-reopen");
    const panelResizer = document.getElementById("panel-resizer");

    function setPanelCollapsed(collapsed) {
      document.body.classList.toggle("panel-collapsed", collapsed);
      if (panelToggle) panelToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    if (panelToggle) panelToggle.addEventListener("click", () => setPanelCollapsed(true));
    if (panelReopen) panelReopen.addEventListener("click", () => setPanelCollapsed(false));

    if (panelResizer) {
      let resizeStart = null;
      panelResizer.addEventListener("pointerdown", (event) => {
        resizeStart = { x: event.clientX, width: panel.getBoundingClientRect().width };
        panelResizer.classList.add("dragging");
        panelResizer.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      panelResizer.addEventListener("pointermove", (event) => {
        if (!resizeStart) return;
        // The handle is on the panel's left edge, so dragging left widens it.
        const next = resizeStart.width - (event.clientX - resizeStart.x);
        const max = Math.max(320, window.innerWidth - 360);
        const clamped = Math.max(300, Math.min(max, next));
        document.documentElement.style.setProperty("--panel-width", clamped + "px");
      });
      const endResize = () => { resizeStart = null; panelResizer.classList.remove("dragging"); };
      panelResizer.addEventListener("pointerup", endResize);
      panelResizer.addEventListener("pointercancel", endResize);
    }

    // Flow-level changes tab: floats over the canvas, opens a popover on click.
    if (flowTab && flowPopover) {
      flowTab.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = flowPopover.hidden;
        flowTab.setAttribute("aria-expanded", open ? "true" : "false");
        flowPopover.hidden = !open;
      });
      document.addEventListener("click", (event) => {
        if (!flowPopover.hidden && !flowPopover.contains(event.target)) {
          closeFlowPopover();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !flowPopover.hidden) {
          closeFlowPopover();
          flowTab.focus();
        }
      });
    }

    applyTheme(readStoredTheme());
    applyView("all");
  </script>
</body>
</html>`;
}

function renderFlowBanner(changes: LayoutedFlow["diff"]["flowChanges"]): string {
  if (!changes || changes.length === 0) {
    return "";
  }
  const statusChange = changes.find((change) => change.path === "status");
  const kind = statusChange ? getStatusKind(statusChange.before, statusChange.after) : "neutral";
  const callout = statusChange ? renderStatusCallout(statusChange.before, statusChange.after, kind) : "";
  const count = changes.length;
  const tabLabel = statusChange && kind !== "neutral"
    ? `${kind === "deactivated" ? "Deactivated" : "Activated"}${count > 1 ? ` · ${count} changes` : ""}`
    : `${count} flow-level ${count === 1 ? "change" : "changes"}`;
  return `<button type="button" id="flow-tab" class="flow-tab ${kind}" aria-expanded="false" aria-controls="flow-popover">
    <span class="flow-tab-dot"></span>${escapeHtml(tabLabel)}<span class="flow-tab-chev">▾</span>
  </button>
  <div id="flow-popover" class="flow-popover" role="region" aria-label="Flow-level changes" hidden>
    <div class="flow-popover-head">Flow-level changes</div>
    <div class="flow-popover-body">
      ${callout}
      <div class="flow-banner-list">
        ${changes.map((change) => `<div class="flow-change-row">
          <div class="flow-change-label">${escapeHtml(humanizePath(change.path))}</div>
          <div class="flow-change-value">${renderValueDelta(change.before, change.after)}</div>
        </div>`).join("")}
      </div>
    </div>
  </div>`;
}

function getStatusKind(before: unknown, after: unknown): "deactivated" | "activated" | "neutral" {
  const beforeText = String(before);
  const afterText = String(after);
  if (beforeText === "Active" && afterText !== "Active") return "deactivated";
  if (beforeText !== "Active" && afterText === "Active") return "activated";
  return "neutral";
}

function renderStatusCallout(before: unknown, after: unknown, kind: "deactivated" | "activated" | "neutral"): string {
  const beforeText = String(before);
  const afterText = String(after);
  if (kind === "deactivated") {
    return `<div class="flow-banner-callout deactivated">Deactivated (${escapeHtml(beforeText)} -> ${escapeHtml(afterText)})</div>`;
  }
  if (kind === "activated") {
    return `<div class="flow-banner-callout activated">Activated (${escapeHtml(beforeText)} -> ${escapeHtml(afterText)})</div>`;
  }
  return `<div class="flow-banner-callout neutral">Status: ${escapeHtml(beforeText)} -> ${escapeHtml(afterText)}</div>`;
}

function renderValueDelta(before: unknown, after: unknown): string {
  if (before === undefined) {
    return `<span class="val ins">${escapeHtml(formatValue(after))}</span>`;
  }
  if (after === undefined) {
    return `<span class="val del">${escapeHtml(formatValue(before))}</span>`;
  }
  return `<span class="val del">${escapeHtml(formatValue(before))}</span><span class="arrow">-></span><span class="val ins">${escapeHtml(formatValue(after))}</span>`;
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "(missing)";
  }
  return String(value);
}

// Build a viewBox that frames the graph with a comfortable margin and, for small
// graphs, a minimum size centered on the content — so the diagram sits centered
// regardless of screen size instead of jammed into a corner or over-zoomed.
function fitViewBox(contentWidth: number, contentHeight: number): string {
  const minWidth = 720;
  const minHeight = 540;
  const width = Math.max(contentWidth, minWidth);
  const height = Math.max(contentHeight, minHeight);
  const x = (contentWidth - width) / 2;
  const y = (contentHeight - height) / 2;
  return `${round(x)} ${round(y)} ${round(width)} ${round(height)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function renderEdge(edge: LayoutedFlow["edges"][number]): string {
  const points = edge.sections.flatMap((section, index) => {
    const start = index === 0 ? [section.startPoint] : [];
    const bends = section.bendPoints ?? [];
    const end = [section.endPoint];
    return [...start, ...bends, ...end];
  });
  if (points.length === 0) {
    return "";
  }
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  return `<path class="edge ${edge.kind} ${edge.status}" d="${d}" data-edge-id="${escapeHtml(edge.id)}"></path>`;
}

function renderNode(node: LayoutedFlow["nodes"][number]): string {
  const lines = wrapLabel(node.label, 22);
  const lineHeight = 14;
  const textY = node.height / 2 - ((lines.length - 1) * lineHeight) / 2 + 5;
  return `<g class="node ${node.status} type-${node.type}" data-node-id="${escapeHtml(node.id)}" transform="translate(${node.x},${node.y})">
    <rect width="${node.width}" height="${node.height}"></rect>
    <text x="${node.width / 2}" y="${textY}" text-anchor="middle" class="node-label">
      ${lines.map((line, index) => `<tspan x="${node.width / 2}" dy="${index === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>`).join("")}
    </text>
  </g>`;
}

function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines.slice(0, 3) : [label];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
