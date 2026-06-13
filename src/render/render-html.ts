import type { LayoutedFlow } from "./layout.ts";

export function renderHtml(layout: LayoutedFlow): string {
  const data = {
    diff: layout.diff,
    nodes: layout.nodes,
    edges: layout.edges,
    width: layout.width,
    height: layout.height,
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
    .legend { display: flex; gap: 14px; font-size: 12px; flex-wrap: wrap; color: var(--muted); }
    .legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: 0; }
    .legend .added::before { background: var(--added); }
    .legend .deleted::before { background: var(--deleted); }
    .legend .modified::before { background: var(--modified); }
    .legend .unchanged::before { background: var(--unchanged); }
    main { display: grid; grid-template-columns: minmax(0, 1fr) clamp(360px, 32vw, 520px); min-height: 0; }
    .canvas { position: relative; overflow: hidden; }
    svg {
      width: 100%; height: 100%; display: block;
      background:
        radial-gradient(circle, #dfe5ee 1px, transparent 1.4px) -11px -11px / 22px 22px,
        linear-gradient(#ffffff, #f7f9fc);
    }
    .panel { min-width: 0; border-left: 1px solid var(--border); background: var(--surface); padding: 20px; overflow-y: auto; overflow-x: hidden; }
    .panel h2 { margin: 0 0 8px; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
    .panel .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; background: #eef1f6; color: var(--muted); margin-bottom: 16px; }
    .panel.added .badge { background: var(--added-fill); color: var(--added); }
    .panel.deleted .badge { background: var(--deleted-fill); color: var(--deleted); }
    .panel.modified .badge { background: var(--modified-fill); color: var(--modified); }
    .panel .empty { color: var(--muted); font-size: 13px; }
    .changes { list-style: none; padding: 0; margin: 4px 0 0; }
    .changes li { min-width: 0; margin-bottom: 12px; padding: 13px 14px; border: 1px solid var(--border); border-radius: 8px; background: #fbfcfe; }
    .change-title { font-weight: 600; margin-bottom: 5px; }
    .change-path { margin-bottom: 12px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
    .change-values { display: grid; gap: 10px; min-width: 0; }
    .change-value { min-width: 0; }
    .change-value-label { margin-bottom: 4px; color: #475569; font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    .changes code { font-size: 12px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: #eef1f6; padding: 2px 5px; border-radius: 4px; overflow-wrap: anywhere; }
    .changes pre { max-width: 100%; margin: 0; padding: 11px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; }
    .edge { fill: none; stroke-width: 1.75; }
    .edge.normal { stroke: var(--edge); marker-end: url(#arrow-normal); }
    .edge.fault { stroke: var(--fault); stroke-dasharray: 6 4; marker-end: url(#arrow-fault); }
    #arrow-normal path { fill: var(--edge); }
    #arrow-fault path { fill: var(--fault); }
    .node rect { rx: 11; ry: 11; stroke-width: 1.75; filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08)); }
    .node { cursor: pointer; }
    .node text { font-size: 12px; fill: #111827; pointer-events: none; }
    .node.added rect { fill: var(--added-fill); stroke: var(--added); }
    .node.deleted rect { fill: var(--deleted-fill); stroke: var(--deleted); }
    .node.modified rect { fill: var(--modified-fill); stroke: var(--modified); }
    .node.unchanged rect { fill: var(--unchanged-fill); stroke: var(--unchanged); }
    .node.selected rect { stroke-width: 3; filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.18)); }
    .node-label { white-space: pre; }
    @media (max-width: 1000px) {
      main { grid-template-columns: minmax(0, 1fr) minmax(320px, 42vw); }
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
    <div class="legend">
      <span class="added">Added</span>
      <span class="deleted">Deleted</span>
      <span class="modified">Modified</span>
      <span class="unchanged">Unchanged</span>
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
        </defs>
        <g id="viewport">
          ${layout.edges.map(renderEdge).join("")}
          ${layout.nodes.map(renderNode).join("")}
        </g>
      </svg>
    </div>
    <aside class="panel">
      <h2 id="panel-title">Select a node</h2>
      <div id="panel-badge" class="badge">No selection</div>
      <div id="panel-body">Click a node to inspect its properties.</div>
    </aside>
  </main>
  <script>
    const DATA = ${json};
    const svg = document.getElementById("flow-svg");
    const viewport = document.getElementById("viewport");
    const panel = document.querySelector(".panel");
    const panelTitle = document.getElementById("panel-title");
    const panelBadge = document.getElementById("panel-badge");
    const panelBody = document.getElementById("panel-body");
    const nodesById = new Map(DATA.nodes.map((node) => [node.id, node]));
    let viewBox = svg.viewBox.baseVal;
    let dragStart = null;

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function selectNode(id) {
      document.querySelectorAll(".node").forEach((el) => el.classList.remove("selected"));
      const selected = document.querySelector(\`.node[data-node-id="\${CSS.escape(id)}"]\`);
      if (selected) selected.classList.add("selected");
      const node = nodesById.get(id);
      if (!node) return;
      panel.className = "panel " + node.status;
      panelTitle.textContent = node.label;
      panelBadge.textContent = node.status.toUpperCase();
      const changes = node.changes || [];
      panelBody.innerHTML = changes.length
        ? "<ul class='changes'>" + changes.map(formatChange).join("") + "</ul>"
        : node.status === "added"
          ? "<div class='empty'>This node was added in the new version.</div>"
          : node.status === "deleted"
            ? "<div class='empty'>This node was removed in the new version.</div>"
            : "<div class='empty'>No property changes.</div>";
    }

    function formatChange(change) {
      const beforeMissing = change.before === undefined;
      const afterMissing = change.after === undefined;
      const action = beforeMissing ? "Added" : afterMissing ? "Removed" : "Changed";
      const values = beforeMissing
        ? formatLabeledValue("New value", change.after)
        : afterMissing
          ? formatLabeledValue("Previous value", change.before)
          : formatLabeledValue("Before", change.before) + formatLabeledValue("After", change.after);
      return "<li><div class='change-title'>" + action + ": " + escapeHtml(humanizePath(change.path)) + "</div>"
        + "<div class='change-path'>Metadata path: <code>" + escapeHtml(change.path) + "</code></div>"
        + "<div class='change-values'>" + values + "</div></li>";
    }

    function formatLabeledValue(label, value) {
      return "<div class='change-value'><div class='change-value-label'>" + label + "</div>" + formatValue(value) + "</div>";
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

    function formatValue(value) {
      if (value === undefined) return "<em>Not present</em>";
      if (value === null) return "<em>Empty value</em>";
      if (typeof value === "object") return "<pre>" + escapeHtml(JSON.stringify(value, null, 2)) + "</pre>";
      return "<code>" + escapeHtml(String(value)) + "</code>";
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

    const initialNode = DATA.nodes.find((node) => node.status === "modified")
      || DATA.nodes.find((node) => node.status !== "unchanged")
      || DATA.nodes[0];
    selectNode(initialNode?.id);
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
  return `<path class="edge ${edge.kind}" d="${d}" data-edge-id="${escapeHtml(edge.id)}"></path>`;
}

function renderNode(node: LayoutedFlow["nodes"][number]): string {
  const lines = wrapLabel(node.label, 22);
  const lineHeight = 14;
  const textY = node.height / 2 - ((lines.length - 1) * lineHeight) / 2 + 5;
  return `<g class="node ${node.status}" data-node-id="${escapeHtml(node.id)}" transform="translate(${node.x},${node.y})">
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
