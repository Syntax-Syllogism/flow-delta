import type { LayoutedFlow } from "./layout.ts";
import { getSectionSchemas } from "./section-schemas.ts";

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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(layout.diff.flowName)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      --bg: #f5f7fb; --surface: #ffffff; --border: #e3e8ef;
      --text: #1f2937; --muted: #64748b; --faint: #94a3b8;
      --added: #16a34a; --added-fill: #dcfce7;
      --deleted: #dc2626; --deleted-fill: #fee2e2;
      --modified: #d97706; --modified-fill: #fef3c7;
      --unchanged: #94a3b8; --unchanged-fill: #e9edf3;
      --edge: #64748b; --fault: #7c3aed;
      --panel-width: 34vw;
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
      background: #f8fafc;
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
      background: #eff6ff;
      border-color: #93c5fd;
      color: var(--text);
      box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12);
    }
    .filters button:focus-visible {
      outline: 2px solid #93c5fd;
      outline-offset: 2px;
    }
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
        radial-gradient(circle, #dfe5ee 1px, transparent 1.4px) -11px -11px / 22px 22px,
        linear-gradient(#ffffff, #f7f9fc);
    }
    .panel { position: relative; min-width: 0; border-left: 1px solid var(--border); background: var(--surface); padding: 20px; overflow-y: auto; overflow-x: hidden; }
    body.panel-collapsed .panel { padding: 0; border-left: 0; overflow: hidden; }
    body.panel-collapsed .panel > *:not(.panel-resizer) { display: none; }
    /* drag-to-resize handle on the panel's left edge */
    .panel-resizer { position: absolute; left: 0; top: 0; bottom: 0; width: 9px; transform: translateX(-50%); cursor: col-resize; z-index: 6; touch-action: none; }
    .panel-resizer::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--border); transform: translateX(-50%); transition: background-color 0.12s ease, width 0.12s ease; }
    .panel-resizer:hover::before, .panel-resizer.dragging::before { background: #93c5fd; width: 3px; }
    body.panel-collapsed .panel-resizer { display: none; }
    .panel-head { display: flex; align-items: flex-start; gap: 8px; }
    .panel-head h2 { flex: 1; min-width: 0; }
    .panel-toggle, .panel-reopen { border: 1px solid var(--border); background: #f8fafc; color: var(--muted); border-radius: 7px; cursor: pointer; font: inherit; line-height: 1; }
    .panel-toggle { flex: none; width: 26px; height: 26px; font-size: 16px; display: grid; place-items: center; }
    .panel-toggle:hover, .panel-reopen:hover { color: var(--text); border-color: #93c5fd; background: #eff6ff; }
    .panel-toggle:focus-visible, .panel-reopen:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
    /* floating tab to reopen the panel once collapsed */
    .panel-reopen { display: none; position: absolute; top: 14px; right: 14px; z-index: 7; padding: 7px 12px; font-size: 12px; font-weight: 600; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12); }
    body.panel-collapsed .panel-reopen { display: inline-flex; align-items: center; gap: 6px; }
    .panel h2 { margin: 0 0 8px; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
    .panel .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; background: #eef1f6; color: var(--muted); margin-bottom: 16px; }
    .panel.added .badge { background: var(--added-fill); color: var(--added); }
    .panel.deleted .badge { background: var(--deleted-fill); color: var(--deleted); }
    .panel.modified .badge { background: var(--modified-fill); color: var(--modified); }
    .panel .empty { color: var(--muted); font-size: 13px; }
    .detail-section { margin: 0 0 12px; border: 1px solid var(--border); border-radius: 8px; background: #fbfcfe; overflow: hidden; }
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
    .val.ins { color: #14532d; background: var(--added-fill); }
    .val.del { color: #7f1d1d; background: var(--deleted-fill); text-decoration: line-through; text-decoration-color: rgba(127, 29, 29, 0.5); }
    .val.faint { color: var(--muted); background: transparent; padding-left: 0; }
    .val em { font-style: normal; color: var(--faint); }
    .val pre { margin: 4px 0 0; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11.5px; line-height: 1.5; }
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
    /* outcome groups (decisions) */
    .outcome-group { margin-bottom: 12px; padding: 10px 11px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); }
    .outcome-group:last-child { margin-bottom: 0; }
    .group-head { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
    .group-label { font-weight: 700; font-size: 12.5px; }
    .outcome-group .changes { margin-bottom: 8px; }
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
    .node rect { rx: 11; ry: 11; stroke-width: 1.75; filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08)); }
    .node { cursor: pointer; }
    .node text { font-size: 12px; fill: #111827; pointer-events: none; }
    .node.added rect { fill: var(--added-fill); stroke: var(--added); }
    .node.deleted rect { fill: var(--deleted-fill); stroke: var(--deleted); }
    .node.modified rect { fill: var(--modified-fill); stroke: var(--modified); }
    .node.unchanged rect { fill: var(--unchanged-fill); stroke: var(--unchanged); }
    .node.selected rect { stroke-width: 3; filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.18)); }
    .node-label { white-space: pre; }
    /* Type-based styling — SHAPE & stroke pattern only. Status (added/deleted/
       modified/unchanged) remains the sole authority on fill/stroke COLOR, so
       the legend stays reliable. Start/end stand out via a pill shape, heavier
       stroke, and a neutral emphasis halo — never via a status-like color. */
    .node.type-start rect, .node.type-end rect { rx: 24; ry: 24; stroke-width: 2.5; filter: drop-shadow(0 0 0 3px rgba(15, 23, 42, 0.16)) drop-shadow(0 1px 3px rgba(15, 23, 42, 0.18)); }
    .node.type-recordLookup rect, .node.type-recordCreate rect, .node.type-recordUpdate rect, .node.type-recordDelete rect { rx: 4; ry: 4; }
    .node.type-screen rect { rx: 6; ry: 6; }
    .node.type-subflow rect { stroke-width: 2.5; }
    .node.type-loop rect { stroke-dasharray: 2 3; }
    .node.type-wait rect { stroke-dasharray: 4 4; }
    .node.selected.type-start rect, .node.selected.type-end rect { stroke-width: 3.5; filter: drop-shadow(0 0 0 5px rgba(15, 23, 42, 0.22)) drop-shadow(0 2px 6px rgba(15, 23, 42, 0.2)); }
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
    const nodesById = new Map(DATA.nodes.map((node) => [node.id, node]));
    const nodeElements = new Map([...document.querySelectorAll(".node")].map((node) => [node.dataset.nodeId, node]));
    const edgeElements = new Map([...document.querySelectorAll(".edge")].map((edge) => [edge.dataset.edgeId, edge]));
    let viewBox = svg.viewBox.baseVal;
    let dragStart = null;
    let selectedNodeId = null;

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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
      const changes = node.changes || [];
      panelBody.innerHTML = changes.length
        ? organizeChanges(node).map((section) => formatSection(section, node)).join("")
        : node.status === "added"
          ? "<div class='empty'>This node was added in the new version.</div>"
          : node.status === "deleted"
            ? "<div class='empty'>This node was removed in the new version.</div>"
            : "<div class='empty'>No property changes.</div>";
    }

    function owns(prefix, path) {
      return path === prefix || path.startsWith(prefix + ".") || path.startsWith(prefix + "[");
    }

    function changeKind(change) {
      return change.before === undefined ? "added" : change.after === undefined ? "removed" : "modified";
    }

    function capitalize(value) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    // Parse "base[idx]rest" — returns the item index and trailing path, or null.
    function matchItem(path, base) {
      if (!path.startsWith(base + "[")) return null;
      const close = path.indexOf("]", base.length + 1);
      if (close === -1) return null;
      const idx = path.slice(base.length + 1, close);
      if (!/^\\d+$/.test(idx)) return null;
      return { idx, rest: path.slice(close + 1) };
    }

    // Group a node's flat change list into ordered sections: schema-driven first,
    // then a generic fallback (array-prefixed groups, then a Configuration bucket).
    function organizeChanges(node) {
      const schemas = DATA.sectionSchemas[node.type] || [];
      const sections = schemas.map((schema) => ({ schema, changes: [] }));
      const fallback = new Map();
      for (const change of node.changes || []) {
        const sec = sections.find((s) => s.schema.paths.some((path) => owns(path, change.path)));
        if (sec) { sec.changes.push(change); continue; }
        const match = change.path.match(/^([^.[]+)(\\[\\d+\\])?/);
        const isArray = !!(match && match[2] !== undefined);
        const key = isArray ? match[1] : "Configuration";
        if (!fallback.has(key)) fallback.set(key, []);
        fallback.get(key).push(change);
      }
      const out = [];
      for (const s of sections) {
        if (s.changes.length) out.push({ name: s.schema.name, schema: s.schema, changes: s.changes });
      }
      for (const [key, changes] of fallback) {
        out.push({
          name: key === "Configuration" ? "Configuration" : humanizePath(key),
          schema: { render: "lines", paths: [key] },
          changes,
        });
      }
      return out;
    }

    function formatSection(section, node) {
      const body = renderSectionBody(section, node);
      return "<details class='detail-section' open><summary>" + escapeHtml(section.name)
        + " <span class='section-count'>(" + section.changes.length + ")</span></summary>"
        + "<div class='section-body'>" + body + "</div></details>";
    }

    function renderSectionBody(section, node) {
      const render = section.schema.render;
      if (render === "grouped-table") return renderGroupedTable(section, node);
      if (render === "table" && section.schema.columns) {
        return renderTable(section.changes, section.schema.paths, section.schema.columns, { before: node.before, after: node.after, prefix: "" });
      }
      return renderLines(section.changes, {});
    }

    // Labeled before → after lines, for scalar changes and the generic fallback.
    // The plain option drops per-line badges — used under a wholly added/removed
    // outcome, where the single group badge already states the change (Finding 3).
    function renderLines(changes, options) {
      const plain = options && options.plain;
      return "<ul class='changes'>" + changes.map((change) => {
        const kind = changeKind(change);
        const badge = plain ? "" : "<span class='change-kind " + kind + "'>" + capitalize(kind) + "</span>";
        return "<li><div class='change-line-head'>" + badge
          + "<span class='change-line-label'>" + escapeHtml(humanizePath(change.path)) + "</span></div>"
          + "<div class='change-line-value'>" + diffValue(change.before, change.after) + "</div></li>";
      }).join("") + "</ul>";
    }

    // Walk a path like "rules[0].conditions[2]" into an object.
    function resolvePath(obj, path) {
      if (obj == null || !path) return undefined;
      let cur = obj;
      const tokens = path.match(/[^.[\\]]+|\\[\\d+\\]/g) || [];
      for (const token of tokens) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = token[0] === "[" ? cur[Number(token.slice(1, -1))] : cur[token];
      }
      return cur;
    }

    // Collapse arr[i].* leaf changes (and whole-item changes) into one row per
    // item index, then fill any unchanged columns from the item snapshot so a
    // modified row still shows its sibling context (Resource/Operator/etc.).
    function buildRows(changes, basePaths, columns, ctx) {
      const rows = new Map();
      let order = 0;
      for (const change of changes) {
        let base = null, idx = null, rest = "";
        for (const p of basePaths) {
          const m = matchItem(change.path, p);
          if (m) { base = p; idx = m.idx; rest = m.rest; break; }
        }
        if (base === null) continue;
        const itemKey = base + "[" + idx + "]";
        if (!rows.has(itemKey)) rows.set(itemKey, { kind: "modified", order: order++, idx, base, cells: {} });
        const row = rows.get(itemKey);
        if (rest === "") {
          row.kind = changeKind(change);
          for (const col of columns) {
            const before = extractField(change.before, col.path);
            const after = extractField(change.after, col.path);
            row.cells[col.path] = { before, after, changed: !valuesEqual(before, after) };
          }
          continue;
        }
        const sub = rest.replace(/^\\./, "");
        const col = columns.find((c) => sub === c.path || sub.startsWith(c.path + ".") || sub.startsWith(c.path + "["));
        if (col) row.cells[col.path] = { before: unwrapValue(change.before), after: unwrapValue(change.after), changed: true };
      }
      const result = [...rows.values()].sort((a, b) => a.order - b.order);
      if (ctx) {
        for (const row of result) {
          const abs = ctx.prefix ? ctx.prefix + "." + row.base + "[" + row.idx + "]" : row.base + "[" + row.idx + "]";
          const snapshot = row.kind === "removed" ? resolvePath(ctx.before, abs) : resolvePath(ctx.after, abs);
          if (!snapshot || typeof snapshot !== "object") continue;
          for (const col of columns) {
            if (row.cells[col.path]) continue;
            const value = extractField(snapshot, col.path);
            if (value !== undefined) row.cells[col.path] = { before: value, after: value, changed: false };
          }
        }
      }
      return result;
    }

    // options.uniformKind (a wholly added/removed group): drop the Change
    // column and per-row badges, colouring every cell by that single kind.
    function renderTable(changes, basePaths, columns, ctx, options) {
      const uniform = options && options.uniformKind;
      const rows = buildRows(changes, basePaths, columns, ctx);
      if (!rows.length) return renderLines(changes, {});
      const head = "<tr><th class='row-idx'>#</th>" + columns.map((c) => "<th>" + escapeHtml(c.label) + "</th>").join("")
        + (uniform ? "" : "<th>Change</th>") + "</tr>";
      const body = rows.map((row) => renderRow(row, columns, uniform)).join("");
      return "<table class='change-table'><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
    }

    function renderRow(row, columns, uniform) {
      const kind = uniform || row.kind;
      const cells = columns.map((col) => {
        const cell = row.cells[col.path];
        if (!cell) return "<td></td>";
        if (kind === "added") return "<td>" + insVal(cell.after !== undefined ? cell.after : cell.before) + "</td>";
        if (kind === "removed") return "<td>" + delVal(cell.before !== undefined ? cell.before : cell.after) + "</td>";
        return "<td>" + (cell.changed ? diffValue(cell.before, cell.after) : faintVal(cell.after)) + "</td>";
      }).join("");
      const badge = uniform ? "" : "<td><span class='change-kind " + row.kind + "'>" + capitalize(row.kind) + "</span></td>";
      return "<tr class='row-" + kind + "'><td class='row-idx'>" + (Number(row.idx) + 1) + "</td>" + cells + badge + "</tr>";
    }

    // Decisions et al.: group by the outer array (one group per outcome/rule).
    // A wholly added/removed outcome shows ONE group badge + plain context; a
    // modified outcome shows its changed conditions in a per-row-badged table.
    function renderGroupedTable(section, node) {
      const schema = section.schema;
      const groups = new Map();
      let order = 0;
      for (const change of section.changes) {
        let matched = null;
        for (const p of schema.paths) {
          const m = matchItem(change.path, p);
          if (m) { matched = { base: p, idx: m.idx, rest: m.rest }; break; }
        }
        if (!matched) continue;
        const key = matched.idx;
        if (!groups.has(key)) groups.set(key, { idx: matched.idx, base: matched.base, order: order++, label: null, kind: "modified", whole: false, inner: [], scalars: [] });
        const g = groups.get(key);
        if (matched.rest === "") {
          g.kind = changeKind(change);
          g.whole = true;
          const obj = change.after !== undefined ? change.after : change.before;
          if (obj && typeof obj === "object") {
            if (schema.groupLabelPath && obj[schema.groupLabelPath]) g.label = obj[schema.groupLabelPath];
            const inner = obj[schema.innerArray];
            if (Array.isArray(inner)) {
              inner.forEach((item, j) => g.inner.push({
                path: schema.innerArray + "[" + j + "]",
                before: g.kind === "removed" ? item : undefined,
                after: g.kind === "removed" ? undefined : item,
              }));
            }
            for (const k of Object.keys(obj)) {
              if (k === schema.innerArray || k === schema.groupLabelPath) continue;
              g.scalars.push({ path: k, before: g.kind === "removed" ? obj[k] : undefined, after: g.kind === "removed" ? undefined : obj[k] });
            }
          }
          continue;
        }
        const sub = matched.rest.replace(/^\\./, "");
        if (sub === schema.groupLabelPath) g.label = change.after !== undefined ? change.after : change.before;
        if (sub === schema.innerArray || sub.startsWith(schema.innerArray + "[")) {
          g.inner.push({ path: sub, before: change.before, after: change.after });
        } else {
          g.scalars.push({ path: sub, before: change.before, after: change.after });
        }
      }
      return [...groups.values()].sort((a, b) => a.order - b.order).map((g) => {
        const label = g.label != null ? String(g.label) : "Outcome " + (Number(g.idx) + 1);
        const head = "<div class='group-head'><span class='change-kind " + g.kind + "'>" + capitalize(g.kind) + "</span>"
          + "<span class='group-label'>" + escapeHtml(label) + "</span></div>";
        const prefix = g.base + "[" + g.idx + "]";
        const scalars = g.scalars.length ? renderLines(g.scalars, { plain: g.whole }) : "";
        const inner = g.inner.length
          ? renderTable(g.inner, [schema.innerArray], schema.innerColumns, { before: node.before, after: node.after, prefix }, g.whole ? { uniformKind: g.kind } : {})
          : "";
        return "<div class='outcome-group'>" + head + scalars + inner + "</div>";
      }).join("");
    }

    function selectNode(id) {
      selectedNodeId = id;
      document.querySelectorAll(".node").forEach((el) => el.classList.remove("selected"));
      const selected = document.querySelector(\`.node[data-node-id="\${CSS.escape(id)}"]\`);
      if (selected) selected.classList.add("selected");
      const node = nodesById.get(id);
      if (node) updatePanel(node);
    }

    function humanizePath(path) {
      const names = {
        assignmentItems: "Assignment item",
        conditions: "Condition",
        rules: "Rule",
      };
      return path.split(".").map((segment) => {
        const match = segment.match(/^([^[]+)(?:\\[(\\d+)\\])?$/);
        if (!match) return segment;
        const name = names[match[1]] || match[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
        return match[2] === undefined ? name : name + " " + (Number(match[2]) + 1);
      }).join(" › ");
    }

    // Collapse Salesforce typed-value wrappers to their scalar so reviewers see
    // "true" / "Something Else" / "{!myVar}" instead of a JSON blob.
    function unwrapValue(value) {
      if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return value;
      if ("elementReference" in value) return "{!" + value.elementReference + "}";
      const keys = Object.keys(value);
      if (keys.length === 1) {
        const key = keys[0];
        if (key === "stringValue" || key === "numberValue" || key === "dateValue" || key === "dateTimeValue") return value[key];
        if (key === "booleanValue") return String(value[key]) === "true" ? "true" : "false";
      }
      return value;
    }

    function extractField(obj, path) {
      if (obj === undefined || obj === null) return undefined;
      let cur = obj;
      for (const segment of path.split(".")) {
        if (cur === null || typeof cur !== "object") return undefined;
        cur = cur[segment];
      }
      return unwrapValue(cur);
    }

    function valuesEqual(a, b) {
      if (a === b) return true;
      if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
      return false;
    }

    function renderScalar(value) {
      if (value === undefined) return "<em>—</em>";
      if (value === null) return "<em>empty</em>";
      if (typeof value === "object") return "<pre>" + escapeHtml(JSON.stringify(value, null, 2)) + "</pre>";
      return escapeHtml(String(value));
    }

    function insVal(value) { return "<span class='val ins'>" + renderScalar(value) + "</span>"; }
    function delVal(value) { return "<span class='val del'>" + renderScalar(value) + "</span>"; }
    function faintVal(value) { return "<span class='val faint'>" + renderScalar(value) + "</span>"; }

    // git-diff value grammar: removed (red strike) → added (green).
    function diffValue(before, after) {
      before = unwrapValue(before);
      after = unwrapValue(after);
      if (before === undefined) return insVal(after);
      if (after === undefined) return delVal(before);
      return delVal(before) + " <span class='arrow'>→</span> " + insVal(after);
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

    applyView("all");
  </script>
</body>
</html>`;
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
