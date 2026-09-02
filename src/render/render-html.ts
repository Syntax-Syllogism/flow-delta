import type { LayoutedFlow } from "./layout.ts";
import { buildFlowArtifactClientData } from "./artifact-client-data.ts";
import { humanizePath } from "./snapshot-panel.ts";
import { renderShell, THEME_STORAGE_KEY } from "./shell.ts";

export { THEME_STORAGE_KEY };

const FLOW_RENDER_STYLES = `
    :root { --surface-subtle:#fbfcfe; --node-text:#111827; --shadow:rgba(15,23,42,.12); --shadow-strong:rgba(15,23,42,.2); --grid-dot:#dfe5ee; --canvas-start:#fff; --canvas-end:#f7f9fc; --edge:#64748b; --fault:#7c3aed; --inserted-text:#14532d; --deleted-text:#7f1d1d; --deleted-line:rgba(127,29,29,.5); }
    :root[data-theme="dark"] { --surface-subtle:#172033; --node-text:#f8fafc; --shadow:rgba(0,0,0,.35); --shadow-strong:rgba(0,0,0,.55); --grid-dot:#334155; --canvas-start:#0f172a; --canvas-end:#111827; --edge:#94a3b8; --fault:#c4b5fd; --inserted-text:#bbf7d0; --deleted-text:#fecaca; --deleted-line:rgba(254,202,202,.55); }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface-subtle:#172033; --node-text:#f8fafc; --shadow:rgba(0,0,0,.35); --shadow-strong:rgba(0,0,0,.55); --grid-dot:#334155; --canvas-start:#0f172a; --canvas-end:#111827; --edge:#94a3b8; --fault:#c4b5fd; --inserted-text:#bbf7d0; --deleted-text:#fecaca; --deleted-line:rgba(254,202,202,.55); } }
    .canvas { position:relative; overflow:hidden; padding:0; }
    .view-canvas[data-view-canvas="outline"] { height:100%; }
    svg { width:100%; height:100%; display:block; background:radial-gradient(circle,var(--grid-dot) 1px,transparent 1.4px) -11px -11px / 22px 22px,linear-gradient(var(--canvas-start),var(--canvas-end)); }
    .meta { display:flex; align-items:center; gap:8px; }
    header .meta .stat { font-variant-numeric: tabular-nums; }
    header .meta .stat.zero { color: var(--faint); }
    header .meta .added:not(.zero) { color: var(--added); }
    header .meta .deleted:not(.zero) { color: var(--deleted); }
    header .meta .modified:not(.zero) { color: var(--modified); }
    header .meta .sep { color: var(--border); }
    .val pre { margin: 4px 0 0; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11.5px; line-height: 1.5; max-height: 220px; overflow: auto; }
    .val.faint { color: var(--muted); background: transparent; padding-left: 0; }
    .val.one-sided { color: var(--text); background: transparent; padding-left: 0; }
    .change-table .row-idx { color: var(--faint); font-variant-numeric: tabular-nums; width: 1%; white-space: nowrap; }
    .change-table tr.row-added { background: rgba(22, 163, 74, 0.06); }
    .change-table tr.row-removed { background: rgba(220, 38, 38, 0.05); }
    .snapshot-card.added { border-left: 2px solid rgba(22, 163, 74, 0.5); }
    .snapshot-card.removed { border-left: 2px solid rgba(220, 38, 38, 0.45); }
    .legend { display:flex; gap:14px; font-size:12px; flex-wrap:wrap; color:var(--muted); }
    .legend span::before { content:""; display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; vertical-align:0; }
    .legend .added::before { background:var(--added); } .legend .deleted::before { background:var(--deleted); } .legend .modified::before { background:var(--modified); } .legend .unchanged::before { background:var(--unchanged); }
    .panel .badge { display:inline-block; padding:3px 9px; border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.03em; background:var(--unchanged-fill); color:var(--muted); margin-bottom:16px; }
    .panel.added .badge, .panel.added .panel-badge, .panel-badge.added { background:var(--added-fill); color:var(--added); } .panel.deleted .badge, .panel.deleted .panel-badge, .panel-badge.deleted { background:var(--deleted-fill); color:var(--deleted); } .panel.modified .badge, .panel.modified .panel-badge, .panel-badge.modified { background:var(--modified-fill); color:var(--modified); }
    .detail-section { margin:0 0 12px; border:1px solid var(--border); border-radius:8px; background:var(--surface-subtle); overflow:hidden; }
    .detail-section.snapshot-section { border-left-width:3px; } .detail-section.snapshot-section.added { border-left-color:rgba(22,163,74,.5); } .detail-section.snapshot-section.deleted { border-left-color:rgba(220,38,38,.45); }
    .detail-section.snapshot-section.added summary { background:rgba(220,252,231,.35); } .detail-section.snapshot-section.deleted summary { background:rgba(254,226,226,.35); }
    .detail-section summary { cursor:pointer; padding:11px 13px; font-weight:650; } .detail-section[open] summary { border-bottom:1px solid var(--border); } .section-count { color:var(--muted); font-size:11px; font-weight:500; } .section-body { padding:12px; overflow-x:auto; }
    .change-kind { display:inline-block; padding:2px 7px; border-radius:999px; font-size:10px; font-weight:700; letter-spacing:.02em; } .change-kind.added { color:var(--added); background:var(--added-fill); } .change-kind.modified { color:var(--modified); background:var(--modified-fill); } .change-kind.removed { color:var(--deleted); background:var(--deleted-fill); }
    .val { font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:12px; border-radius:4px; padding:1px 5px; overflow-wrap:anywhere; } .val.ins { color:var(--inserted-text); background:var(--added-fill); } .val.del { color:var(--deleted-text); background:var(--deleted-fill); text-decoration:line-through; text-decoration-color:var(--deleted-line); } .arrow { color:var(--faint); margin:0 2px; }
    .changes { list-style:none; padding:0; margin:0; } .changes li { min-width:0; margin-bottom:9px; } .changes li:last-child { margin-bottom:0; } .change-line-head { display:flex; align-items:center; gap:7px; margin-bottom:4px; } .change-line-label { font-weight:600; font-size:12px; } .change-line-value { padding-left:2px; } .change-table { width:100%; border-collapse:collapse; font-size:12px; } .change-table th,.change-table td { padding:7px 8px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; overflow-wrap:anywhere; } .change-table th { color:var(--muted); font-size:10.5px; letter-spacing:.04em; text-transform:uppercase; } .change-table tr:last-child td { border-bottom:0; } .snapshot-kv { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px; } .snapshot-kv th,.snapshot-kv td { padding:6px 7px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; overflow-wrap:anywhere; } .snapshot-kv th { color:var(--muted); width:34%; font-weight:650; } .snapshot-kv tr:last-child th,.snapshot-kv tr:last-child td { border-bottom:0; } .snapshot-nested { border-left:2px solid var(--border); padding-left:10px; margin:10px 0; } .snapshot-nested-title { color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; margin-bottom:7px; } .snapshot-card { border:1px dashed var(--border); border-radius:7px; padding:9px 10px; margin:8px 0; background:var(--surface); } .snapshot-card-title { font-size:12px; font-weight:700; margin-bottom:7px; overflow-wrap:anywhere; }
    .outcome-group { margin-bottom:12px; padding:10px 11px; border:1px solid var(--border); border-radius:7px; background:var(--surface); } .outcome-group:last-child { margin-bottom:0; } .group-head { display:flex; align-items:center; gap:7px; margin-bottom:8px; } .group-label { font-weight:700; font-size:12.5px; }
    .flow-tab { position:absolute; top:14px; left:14px; z-index:6; display:inline-flex; align-items:center; gap:7px; border:1px solid var(--border); background:var(--surface-muted); color:var(--muted); border-radius:7px; padding:7px 12px; font:inherit; font-size:12px; font-weight:600; line-height:1; box-shadow:0 1px 3px var(--shadow); cursor:pointer; } .flow-tab:hover { color:var(--text); border-color:var(--focus); background:var(--surface-selected); } .flow-tab:focus-visible { outline:2px solid var(--focus); outline-offset:2px; } .flow-tab .flow-tab-dot { width:6px; height:6px; border-radius:50%; background:var(--modified); flex:none; } .flow-tab.deactivated .flow-tab-dot { background:var(--deleted); } .flow-tab.activated .flow-tab-dot { background:var(--added); } .flow-tab .flow-tab-chev { font-size:9px; opacity:.75; transition:transform .12s ease; } .flow-tab[aria-expanded="true"] .flow-tab-chev { transform:rotate(180deg); }
    .flow-popover { position:absolute; top:14px; left:14px; z-index:6; width:min(300px,calc(100% - 28px)); background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:0 16px 40px -12px var(--shadow-strong); overflow:hidden; } .flow-popover[hidden] { display:none; } .flow-popover-head { padding:10px 12px; border-bottom:1px solid var(--border); background:var(--surface-muted); font-size:12px; font-weight:650; } .flow-popover-body { padding:12px; max-height:60vh; overflow:auto; } .flow-banner-callout { margin-bottom:8px; font-weight:750; } .flow-banner-callout.deactivated { color:var(--deleted); } .flow-banner-callout.activated { color:var(--added); } .flow-banner-callout.neutral { color:var(--modified); } .flow-banner-list { display:grid; gap:7px; } .flow-change-row { display:grid; grid-template-columns:minmax(90px,120px) minmax(0,1fr); align-items:start; gap:10px; } .flow-change-row + .flow-change-row { margin-top:7px; } .flow-change-label { color:var(--muted); font-size:12px; font-weight:700; } .flow-change-value { min-width: 0; max-height: 180px; overflow: auto; }
    .edge { fill:none; } .edge.unchanged { stroke-width:1.4; opacity:.55; } .edge.normal.unchanged { stroke:var(--edge); marker-end:url(#arrow-normal); } .edge.fault.unchanged { stroke:var(--fault); stroke-dasharray:6 4; marker-end:url(#arrow-fault); } .edge.added { stroke:var(--added); stroke-width:3; marker-end:url(#arrow-added); } .edge.deleted { stroke:var(--deleted); stroke-width:2; stroke-dasharray:7 5; marker-end:url(#arrow-deleted); } #arrow-normal path { fill:var(--edge); } #arrow-fault path { fill:var(--fault); } #arrow-added path { fill:var(--added); } #arrow-deleted path { fill:var(--deleted); }
    .edge.present { stroke:var(--edge); stroke-width:1.8; marker-end:url(#arrow-normal); opacity:.9; } .edge.fault.present { stroke:var(--fault); stroke-dasharray:6 4; }
    .node rect { rx:11; ry:11; stroke-width:1.75; filter:drop-shadow(0 1px 2px var(--shadow)); } .node { cursor:pointer; } .node text { font-size:12px; fill:var(--node-text); pointer-events:none; } .node.added rect { fill:var(--added-fill); stroke:var(--added); } .node.deleted rect { fill:var(--deleted-fill); stroke:var(--deleted); } .node.modified rect { fill:var(--modified-fill); stroke:var(--modified); } .node.unchanged rect { fill:var(--unchanged-fill); stroke:var(--unchanged); } .node.selected rect { stroke-width:3; filter:drop-shadow(0 2px 6px var(--shadow-strong)); } .node-label { white-space:pre; } .node.type-start rect,.node.type-end rect { rx:24; ry:24; stroke-width:2.5; filter:drop-shadow(0 0 0 3px var(--shadow)) drop-shadow(0 1px 3px var(--shadow-strong)); } .node.type-recordLookup rect,.node.type-recordCreate rect,.node.type-recordUpdate rect,.node.type-recordDelete rect { rx:4; ry:4; } .node.type-screen rect { rx:6; ry:6; } .node.type-subflow rect { stroke-width:2.5; } .node.type-loop rect { stroke-dasharray:2 3; } .node.type-wait rect { stroke-dasharray:4 4; } .node.selected.type-start rect,.node.selected.type-end rect { stroke-width:3.5; filter:drop-shadow(0 0 0 5px var(--shadow-strong)) drop-shadow(0 2px 6px var(--shadow-strong)); }
    :root { --type-screen:#2563eb; --type-screen-fill:#dbeafe; --type-decision:#d97706; --type-decision-fill:#fef3c7; --type-record:#0f766e; --type-record-fill:#ccfbf1; --type-loop:#7c3aed; --type-loop-fill:#ede9fe; --type-subflow:#475569; --type-subflow-fill:#e2e8f0; --type-assignment:#4f46e5; --type-assignment-fill:#e0e7ff; --type-action:#0891b2; --type-action-fill:#cffafe; --type-wait:#8b5cf6; --type-wait-fill:#ede9fe; --type-start:#16a34a; --type-start-fill:#dcfce7; --type-end:#dc2626; --type-end-fill:#fee2e2; --type-neutral:#64748b; --type-neutral-fill:#e2e8f0; }
    :root[data-theme="dark"] { --type-screen:#60a5fa; --type-screen-fill:#172554; --type-decision:#fbbf24; --type-decision-fill:#422006; --type-record:#2dd4bf; --type-record-fill:#123b3a; --type-loop:#c4b5fd; --type-loop-fill:#2e1d55; --type-subflow:#cbd5e1; --type-subflow-fill:#273449; --type-assignment:#a5b4fc; --type-assignment-fill:#25205b; --type-action:#67e8f9; --type-action-fill:#123b49; --type-wait:#c4b5fd; --type-wait-fill:#2e1d55; --type-start:#4ade80; --type-start-fill:#123f2a; --type-end:#f87171; --type-end-fill:#4a1d23; --type-neutral:#94a3b8; --type-neutral-fill:#263241; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --type-screen:#60a5fa; --type-screen-fill:#172554; --type-decision:#fbbf24; --type-decision-fill:#422006; --type-record:#2dd4bf; --type-record-fill:#123b3a; --type-loop:#c4b5fd; --type-loop-fill:#2e1d55; --type-subflow:#cbd5e1; --type-subflow-fill:#273449; --type-assignment:#a5b4fc; --type-assignment-fill:#25205b; --type-action:#67e8f9; --type-action-fill:#123b49; --type-wait:#c4b5fd; --type-wait-fill:#2e1d55; --type-start:#4ade80; --type-start-fill:#123f2a; --type-end:#f87171; --type-end-fill:#4a1d23; --type-neutral:#94a3b8; --type-neutral-fill:#263241; } }
    :root[data-mode="snapshot"] .node.present rect { stroke:var(--type-neutral); fill:var(--type-neutral-fill); }
    :root[data-mode="snapshot"] .node.present.type-screen rect { stroke:var(--type-screen); fill:var(--type-screen-fill); } :root[data-mode="snapshot"] .node.present.type-decision rect { stroke:var(--type-decision); fill:var(--type-decision-fill); } :root[data-mode="snapshot"] .node.present.type-recordLookup rect,:root[data-mode="snapshot"] .node.present.type-recordCreate rect,:root[data-mode="snapshot"] .node.present.type-recordUpdate rect,:root[data-mode="snapshot"] .node.present.type-recordDelete rect { stroke:var(--type-record); fill:var(--type-record-fill); } :root[data-mode="snapshot"] .node.present.type-loop rect { stroke:var(--type-loop); fill:var(--type-loop-fill); } :root[data-mode="snapshot"] .node.present.type-subflow rect { stroke:var(--type-subflow); fill:var(--type-subflow-fill); } :root[data-mode="snapshot"] .node.present.type-assignment rect { stroke:var(--type-assignment); fill:var(--type-assignment-fill); } :root[data-mode="snapshot"] .node.present.type-actionCall rect,:root[data-mode="snapshot"] .node.present.type-apexPluginCall rect { stroke:var(--type-action); fill:var(--type-action-fill); } :root[data-mode="snapshot"] .node.present.type-wait rect { stroke:var(--type-wait); fill:var(--type-wait-fill); } :root[data-mode="snapshot"] .node.present.type-start rect { stroke:var(--type-start); fill:var(--type-start-fill); } :root[data-mode="snapshot"] .node.present.type-end rect { stroke:var(--type-end); fill:var(--type-end-fill); }
    .snapshot-inventory { display:flex; align-items:center; gap:8px; flex-wrap:wrap; } .snapshot-inventory .stat { color:var(--text); } .snapshot-type-legend { display:flex; gap:12px; flex-wrap:wrap; } .snapshot-type-legend span { white-space:nowrap; } .snapshot-type-swatch { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px; vertical-align:0; background:var(--type-neutral); } .snapshot-type-legend .type-screen .snapshot-type-swatch { background:var(--type-screen); } .snapshot-type-legend .type-decision .snapshot-type-swatch { background:var(--type-decision); } .snapshot-type-legend .type-record .snapshot-type-swatch { background:var(--type-record); } .snapshot-type-legend .type-loop .snapshot-type-swatch { background:var(--type-loop); } .snapshot-type-legend .type-subflow .snapshot-type-swatch { background:var(--type-subflow); } .snapshot-type-legend .type-assignment .snapshot-type-swatch { background:var(--type-assignment); } .snapshot-type-legend .type-action .snapshot-type-swatch { background:var(--type-action); } .snapshot-type-legend .type-wait .snapshot-type-swatch { background:var(--type-wait); } .snapshot-type-legend .type-start .snapshot-type-swatch { background:var(--type-start); } .snapshot-type-legend .type-end .snapshot-type-swatch { background:var(--type-end); }
    .detail-section.snapshot-section.present { border-left-color:var(--type-neutral); } .detail-section.snapshot-section.present summary { background:color-mix(in srgb,var(--type-neutral-fill) 45%,transparent); } .panel.present .panel-badge { background:var(--type-neutral-fill); color:var(--type-neutral); }
    @media (max-width:1000px) { .panel { padding:16px; } }
`;

export function renderHtml(layout: LayoutedFlow): string {
  const snapshotMode = layout.diff.mode === "snapshot";
  const data = buildFlowArtifactClientData(layout);
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const s = layout.diff.summary;
  const stat = (n: number, kind: string, word: string) =>
    `<span class="stat ${kind}${n === 0 ? " zero" : ""}">${n} ${word}</span>`;
  const edgeStat = s.addedEdges + s.removedEdges > 0
    ? `<span class="sep">·</span><span class="stat edges">+${s.addedEdges}/−${s.removedEdges} edges</span>`
    : "";
  const metaHtml = snapshotMode
    ? renderSnapshotMeta(layout)
    : `${stat(s.addedNodes, "added", "added")}<span class="sep">·</span>`
      + `${stat(s.removedNodes, "deleted", "deleted")}<span class="sep">·</span>`
      + `${stat(s.modifiedNodes, "modified", "modified")}${edgeStat}`
      + `<div class="legend"><span class="added">Added</span><span class="deleted">Deleted</span><span class="modified">Modified</span><span class="unchanged">Unchanged</span></div>`;
  const viewBox = fitViewBox(layout.width, layout.height);
  const flowBannerHtml = snapshotMode
    ? renderSnapshotFacts(layout.diff.snapshotMeta)
    : renderFlowBanner(layout.diff.flowChanges);
  const svgAccessibleName = snapshotMode ? "Flow snapshot" : "Flow diff";
  const contentHtml = `<svg id="flow-svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${svgAccessibleName}">
    <defs>
      <marker id="arrow-normal" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z"></path></marker>
      <marker id="arrow-fault" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z"></path></marker>
      <marker id="arrow-added" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z"></path></marker>
      <marker id="arrow-deleted" markerWidth="8" height="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z"></path></marker>
    </defs>
    <g id="viewport">${layout.edges.map(renderEdge).join("")}${layout.nodes.map(renderNode).join("")}</g>
  </svg>`;
  const clientScript = `
    const DATA = ${json};
    const svg = document.getElementById("flow-svg");
    const viewport = document.getElementById("viewport");
    const panel = document.querySelector(".panel");
    const panelTitle = document.getElementById("panel-title");
    const panelBadge = document.getElementById("panel-badge");
    const panelBody = document.getElementById("panel-body");
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

    function isNodeVisible(node, mode) {
      if (mode === "after") return node.status !== "deleted";
      if (mode === "before") return node.status !== "added";
      if (mode === "changes") return node.status !== "unchanged";
      return true;
    }

    function isEdgeVisible(edge, mode, visibleNodeIds) {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return false;
      if (mode === "after") return edge.status !== "deleted";
      if (mode === "before") return edge.status !== "added";
      if (mode === "changes") {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);
        return edge.status !== "unchanged" || (source?.status !== "unchanged" && target?.status !== "unchanged");
      }
      return true;
    }

    function edgePath(sections) {
      const points = sections.flatMap((section, index) => [...(index === 0 ? [section.startPoint] : []), ...(section.bendPoints ?? []), section.endPoint]);
      return points.length === 0 ? "" : points.map((point, index) => (index === 0 ? "M" : "L") + " " + point.x + " " + point.y).join(" ");
    }

    function escapeHtml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }

    function round(value) { return Math.round(value * 100) / 100; }
    function collectEdgePoints(sections) { return sections.flatMap((section, index) => [...(index === 0 ? [section.startPoint] : []), ...(section.bendPoints ?? []), section.endPoint]); }
    function measureVisibleBounds(nodes, edges) {
      const points = [...nodes.flatMap((node) => [{ x: node.x, y: node.y }, { x: node.x + node.width, y: node.y + node.height }]), ...edges.flatMap((edge) => collectEdgePoints(edge.sections))];
      if (points.length === 0) return null;
      let minX = points[0].x, minY = points[0].y, maxX = points[0].x, maxY = points[0].y;
      for (const point of points.slice(1)) { if (point.x < minX) minX = point.x; if (point.y < minY) minY = point.y; if (point.x > maxX) maxX = point.x; if (point.y > maxY) maxY = point.y; }
      return { x: minX - 20, y: minY - 20, width: maxX - minX + 40, height: maxY - minY + 40 };
    }
    function fitViewBoxRect(bounds) { const width = Math.max(bounds.width, 720), height = Math.max(bounds.height, 540); return { x: round(bounds.x + (bounds.width - width) / 2), y: round(bounds.y + (bounds.height - height) / 2), width: round(width), height: round(height) }; }
    function updateViewBox(bounds) { const box = fitViewBoxRect(bounds); viewBox.x = box.x; viewBox.y = box.y; viewBox.width = box.width; viewBox.height = box.height; }
    function clearSelection(message) { selectedNodeId = null; document.querySelectorAll(".node").forEach((el) => el.classList.remove("selected")); panel.className = "panel"; panelTitle.textContent = "No visible nodes"; panelBadge.textContent = "Hidden"; panelBody.innerHTML = "<div class='empty'>" + escapeHtml(message) + "</div>"; }
    const snapshotMode = ${JSON.stringify(snapshotMode)};
    function humanizeType(type) { return type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()); }
    function updatePanel(node) { panel.className = "panel " + node.status; panelTitle.textContent = node.label; panelBadge.textContent = snapshotMode ? humanizeType(node.type) : node.status.toUpperCase(); panelBody.innerHTML = node.detailHtml; }

    function selectNode(id) { selectedNodeId = id; document.querySelectorAll(".node").forEach((el) => el.classList.remove("selected")); const selected = [...document.querySelectorAll(".node")].find((el) => el.dataset.nodeId === id); if (selected) selected.classList.add("selected"); const node = nodesById.get(id); if (node) updatePanel(node); }
    function pickInitialNode(visibleNodeIds) { return snapshotMode ? DATA.nodes.find((node) => visibleNodeIds.has(node.id) && node.type === "start") || DATA.nodes.find((node) => visibleNodeIds.has(node.id)) || null : DATA.nodes.find((node) => visibleNodeIds.has(node.id) && node.status === "modified") || DATA.nodes.find((node) => visibleNodeIds.has(node.id) && node.status !== "unchanged") || DATA.nodes.find((node) => visibleNodeIds.has(node.id)) || null; }
    function applyView(mode) {
      const layout = mode === "all" || mode === "changes" ? DATA.layouts.union : DATA.layouts[mode];
      const nodeLayout = new Map(layout.nodes.map((node) => [node.id, node]));
      const edgeLayout = new Map(layout.edges.map((edge) => [edge.id, edge]));
      const visibleNodeIds = new Set(), visibleNodes = [], visibleEdges = [];
      DATA.nodes.forEach((node) => { const element = nodeElements.get(node.id); if (!element) return; if (!isNodeVisible(node, mode)) { element.style.display = "none"; return; } const positioned = nodeLayout.get(node.id); if (!positioned) { element.style.display = "none"; return; } element.style.display = ""; element.setAttribute("transform", "translate(" + positioned.x + "," + positioned.y + ")"); visibleNodeIds.add(node.id); visibleNodes.push(positioned); });
      DATA.edges.forEach((edge) => { const element = edgeElements.get(edge.id); if (!element) return; if (!isEdgeVisible(edge, mode, visibleNodeIds)) { element.style.display = "none"; return; } const positioned = edgeLayout.get(edge.id); if (!positioned) { element.style.display = "none"; return; } element.style.display = ""; element.setAttribute("d", edgePath(positioned.sections)); visibleEdges.push(positioned); });
      updateViewBox(measureVisibleBounds(visibleNodes, visibleEdges) || { x: 0, y: 0, width: layout.width, height: layout.height });
      if (selectedNodeId && visibleNodeIds.has(selectedNodeId)) { const node = nodesById.get(selectedNodeId); if (node) updatePanel(node); return; }
      const initialNode = pickInitialNode(visibleNodeIds); if (initialNode) selectNode(initialNode.id); else clearSelection("This view has no visible nodes.");
    }

    document.addEventListener("flowdelta:view-mode", (event) => applyView(event.detail));
    document.querySelectorAll(".node").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        closeFlowPopover();
        selectNode(node.dataset.nodeId);
      });
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        closeFlowPopover();
        selectNode(node.dataset.nodeId);
      });
    });
    svg.addEventListener("wheel", (event) => { event.preventDefault(); const scale = event.deltaY < 0 ? .9 : 1.1, rect = svg.getBoundingClientRect(), mx = viewBox.x + (event.clientX - rect.left) * (viewBox.width / rect.width), my = viewBox.y + (event.clientY - rect.top) * (viewBox.height / rect.height); viewBox.x = mx - (mx - viewBox.x) * scale; viewBox.y = my - (my - viewBox.y) * scale; viewBox.width *= scale; viewBox.height *= scale; }, { passive:false });
    svg.addEventListener("pointerdown", (event) => { if (event.target.closest(".node")) return; dragStart = { x:event.clientX, y:event.clientY, viewBox:{ x:viewBox.x, y:viewBox.y } }; svg.setPointerCapture(event.pointerId); });
    svg.addEventListener("pointermove", (event) => { if (!dragStart) return; const rect = svg.getBoundingClientRect(), dx = (event.clientX - dragStart.x) * (viewBox.width / rect.width), dy = (event.clientY - dragStart.y) * (viewBox.height / rect.height); viewBox.x = dragStart.viewBox.x - dx; viewBox.y = dragStart.viewBox.y - dy; });
    svg.addEventListener("pointerup", () => { dragStart = null; }); svg.addEventListener("pointercancel", () => { dragStart = null; });
    if (flowTab && flowPopover) { flowTab.addEventListener("click", (event) => { event.stopPropagation(); const open = flowPopover.hidden; flowTab.setAttribute("aria-expanded", open ? "true" : "false"); flowPopover.hidden = !open; }); document.addEventListener("click", (event) => { if (!flowPopover.hidden && !flowPopover.contains(event.target)) closeFlowPopover(); }); document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !flowPopover.hidden) { closeFlowPopover(); flowTab.focus(); } }); }
    applyView("all");
  `;
  return renderShell({
    title: layout.diff.flowName,
    metaHtml,
    bannerHtml: flowBannerHtml,
    contentHtml,
    stylesHtml: FLOW_RENDER_STYLES,
    mode: snapshotMode ? "snapshot" : "diff",
    showFilters: !snapshotMode,
    footerHtml: snapshotMode ? renderProvenanceFooter(layout.diff.snapshotMeta) : undefined,
    panelTitle: "Select a node",
    panelBackHtml: "",
    panelBadgeHtml: `<div id="panel-badge" class="panel-badge">No selection</div>`,
    panelBodyHtml: `<div id="panel-body">Click a node to inspect its properties.</div>`,
    clientScript,
  });
}

const SNAPSHOT_TYPE_GROUPS = [
  { key: "start", label: "Start", types: ["start"] },
  { key: "end", label: "End", types: ["end"] },
  { key: "screen", label: "Screens", types: ["screen"] },
  { key: "decision", label: "Decisions", types: ["decision"] },
  { key: "record", label: "Record operations", types: ["recordLookup", "recordCreate", "recordUpdate", "recordDelete"] },
  { key: "loop", label: "Loops", types: ["loop"] },
  { key: "subflow", label: "Subflows", types: ["subflow"] },
  { key: "assignment", label: "Assignments", types: ["assignment"] },
  { key: "action", label: "Actions", types: ["actionCall", "apexPluginCall"] },
  { key: "wait", label: "Waits", types: ["wait"] },
  { key: "other", label: "Other", types: ["step", "orchestratedStage", "transform", "collectionProcessor", "customError", "recordRollback", "unknown"] },
] as const;

function renderSnapshotMeta(layout: LayoutedFlow): string {
  const counts = new Map<string, number>();
  for (const node of layout.diff.nodes) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  const inventory = [
    `<span class="stat">${layout.diff.nodes.length} ${layout.diff.nodes.length === 1 ? "element" : "elements"}</span>`,
    ...SNAPSHOT_TYPE_GROUPS
      .map((group) => ({ ...group, count: group.types.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0) }))
      .filter((group) => group.count > 0)
      .map((group) => `<span class="stat">${group.count} ${escapeHtml(group.label.toLowerCase())}</span>`),
    `<span class="stat">${layout.diff.edges.length} ${layout.diff.edges.length === 1 ? "connector" : "connectors"}</span>`,
  ].join(`<span class="sep">·</span>`);
  const legend = SNAPSHOT_TYPE_GROUPS
    .map((group) => ({ ...group, count: group.types.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0) }))
    .filter((group) => group.count > 0)
    .map((group) => `<span class="type-${group.key}"><span class="snapshot-type-swatch"></span>${escapeHtml(group.label)}</span>`)
    .join("");
  return `<div class="snapshot-inventory">${inventory}</div><div class="snapshot-type-legend">${legend}</div>`;
}

function renderSnapshotFacts(meta: LayoutedFlow["diff"]["snapshotMeta"]): string {
  if (!meta) return "";
  const facts = [
    ["Label", meta.label],
    ["Status", meta.status],
    ["Process type", meta.processType],
    ["API version", meta.apiVersion],
    ["Run in mode", meta.runInMode],
  ].filter((fact): fact is [string, string] => fact[1] !== undefined && fact[1] !== "");
  return `<button type="button" id="flow-tab" class="flow-tab snapshot" aria-expanded="false" aria-controls="flow-popover"><span class="flow-tab-dot"></span>Flow facts<span class="flow-tab-chev">▾</span></button><div id="flow-popover" class="flow-popover" role="region" aria-label="Flow facts" hidden><div class="flow-popover-head">Flow facts</div><div class="flow-popover-body"><div class="flow-banner-list">${facts.map(([label, value]) => `<div class="flow-change-row"><div class="flow-change-label">${escapeHtml(label)}</div><div class="flow-change-value">${escapeHtml(value)}</div></div>`).join("")}</div></div></div>`;
}

function renderProvenanceFooter(meta: LayoutedFlow["diff"]["snapshotMeta"]): string {
  if (!meta) return "";
  const version = meta.versionNumber === undefined ? "" : ` · Version ${meta.versionNumber}`;
  return `<footer class="provenance">${escapeHtml(meta.flowName ?? meta.label)}${version} · ${escapeHtml(meta.source)} · Generated ${escapeHtml(meta.generatedAt)} · FlowDelta ${escapeHtml(meta.toolVersion)}</footer>`;
}

function renderFlowBanner(changes: LayoutedFlow["diff"]["flowChanges"]): string {
  if (!changes || changes.length === 0) return "";
  const statusChange = changes.find((change) => change.path === "status");
  const kind = statusChange ? getStatusKind(statusChange.before, statusChange.after) : "neutral";
  const callout = statusChange ? renderStatusCallout(statusChange.before, statusChange.after, kind) : "";
  const count = changes.length;
  const tabLabel = statusChange && kind !== "neutral" ? `${kind === "deactivated" ? "Deactivated" : "Activated"}${count > 1 ? ` · ${count} changes` : ""}` : `${count} flow-level ${count === 1 ? "change" : "changes"}`;
  return `<button type="button" id="flow-tab" class="flow-tab ${kind}" aria-expanded="false" aria-controls="flow-popover"><span class="flow-tab-dot"></span>${escapeHtml(tabLabel)}<span class="flow-tab-chev">▾</span></button><div id="flow-popover" class="flow-popover" role="region" aria-label="Flow-level changes" hidden><div class="flow-popover-head">Flow-level changes</div><div class="flow-popover-body">${callout}<div class="flow-banner-list">${changes.map((change) => `<div class="flow-change-row"><div class="flow-change-label">${escapeHtml(humanizePath(change.path))}</div><div class="flow-change-value">${renderValueDelta(change.before, change.after)}</div></div>`).join("")}</div></div></div>`;
}

function getStatusKind(before: unknown, after: unknown): "deactivated" | "activated" | "neutral" { const beforeText = String(before), afterText = String(after); if (beforeText === "Active" && afterText !== "Active") return "deactivated"; if (beforeText !== "Active" && afterText === "Active") return "activated"; return "neutral"; }
function renderStatusCallout(before: unknown, after: unknown, kind: "deactivated" | "activated" | "neutral"): string { const beforeText = String(before), afterText = String(after); if (kind === "deactivated") return `<div class="flow-banner-callout deactivated">Deactivated (${escapeHtml(beforeText)} -> ${escapeHtml(afterText)})</div>`; if (kind === "activated") return `<div class="flow-banner-callout activated">Activated (${escapeHtml(beforeText)} -> ${escapeHtml(afterText)})</div>`; return `<div class="flow-banner-callout neutral">Status: ${escapeHtml(beforeText)} -> ${escapeHtml(afterText)}</div>`; }
function renderValueDelta(before: unknown, after: unknown): string { if (before === undefined) return `<span class="val ins">${escapeHtml(formatValue(after))}</span>`; if (after === undefined) return `<span class="val del">${escapeHtml(formatValue(before))}</span>`; return `<span class="val del">${escapeHtml(formatValue(before))}</span><span class="arrow">-></span><span class="val ins">${escapeHtml(formatValue(after))}</span>`; }
function formatValue(value: unknown): string { return value === undefined ? "(missing)" : String(value); }
function fitViewBox(contentWidth: number, contentHeight: number): string { const width = Math.max(contentWidth, 720), height = Math.max(contentHeight, 540); return `${round((contentWidth - width) / 2)} ${round((contentHeight - height) / 2)} ${round(width)} ${round(height)}`; }
function round(value: number): number { return Math.round(value * 100) / 100; }
function renderEdge(edge: LayoutedFlow["edges"][number]): string { const points = edge.sections.flatMap((section, index) => [...(index === 0 ? [section.startPoint] : []), ...(section.bendPoints ?? []), section.endPoint]); if (points.length === 0) return ""; const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "); return `<path class="edge ${edge.kind} ${edge.status}" d="${d}" data-edge-id="${escapeHtml(edge.id)}"></path>`; }
function renderNode(node: LayoutedFlow["nodes"][number]): string { const lines = wrapLabel(node.label, 22), lineHeight = 14, textY = node.height / 2 - ((lines.length - 1) * lineHeight) / 2 + 5; return `<g class="node ${node.status} type-${node.type}" role="button" tabindex="0" data-node-id="${escapeHtml(node.id)}" transform="translate(${node.x},${node.y})"><rect width="${node.width}" height="${node.height}"></rect><text x="${node.width / 2}" y="${textY}" text-anchor="middle" class="node-label">${lines.map((line, index) => `<tspan x="${node.width / 2}" dy="${index === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>`).join("")}</text></g>`; }
function wrapLabel(label: string, maxChars: number): string[] { const words = label.split(/\s+/), lines: string[] = []; let current = ""; for (const word of words) { const candidate = current ? `${current} ${word}` : word; if (candidate.length > maxChars && current) { lines.push(current); current = word; } else current = candidate; } if (current) lines.push(current); return lines.length ? lines.slice(0, 3) : [label]; }
function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
