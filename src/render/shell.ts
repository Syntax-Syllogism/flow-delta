export const THEME_STORAGE_KEY = "flow-delta-theme";
export const VIEW_STORAGE_KEY = "flow-delta-view";

export interface ShellOptions {
  title: string;
  metaHtml: string;
  bannerHtml?: string;
  contentHtml: string;
  wireframeHtml?: string;
  defaultView?: "outline" | "wireframe";
  clientScript: string;
  productName?: string;
}

export function renderShell(options: ShellOptions): string {
  const title = escapeHtml(options.title);
  const productName = escapeHtml(options.productName ?? "FlowDelta");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <script>
    (() => {
      const key = ${JSON.stringify(THEME_STORAGE_KEY)};
      const allowed = new Set(["system", "light", "dark"]);
      let theme = "system";
      try { const stored = localStorage.getItem(key); if (allowed.has(stored)) theme = stored; } catch {}
      document.documentElement.dataset.theme = theme;
    })();${options.wireframeHtml === undefined ? "" : `
    (() => {
      const key = ${JSON.stringify(VIEW_STORAGE_KEY)};
      const allowed = new Set(["outline", "wireframe"]);
      let view = ${JSON.stringify(options.defaultView ?? "outline")};
      try { const stored = localStorage.getItem(key); if (allowed.has(stored)) view = stored; } catch {}
      document.documentElement.dataset.view = view;
    })();`}
  </script>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; --bg:#f5f7fb; --surface:#fff; --surface-muted:#f8fafc; --surface-selected:#eff6ff; --border:#e3e8ef; --focus:#93c5fd; --text:#1f2937; --muted:#64748b; --faint:#94a3b8; --added:#16a34a; --added-fill:#dcfce7; --deleted:#dc2626; --deleted-fill:#fee2e2; --modified:#d97706; --modified-fill:#fef3c7; --unchanged:#94a3b8; --unchanged-fill:#e9edf3; --panel-width:34vw; }
    :root[data-theme="dark"] { color-scheme:dark; --bg:#0f172a; --surface:#111827; --surface-muted:#1f2937; --surface-selected:#1e3a5f; --border:#334155; --focus:#60a5fa; --text:#e5e7eb; --muted:#a5b4c7; --faint:#718096; --added:#4ade80; --added-fill:#123f2a; --deleted:#f87171; --deleted-fill:#4a1d23; --modified:#fbbf24; --modified-fill:#46330d; --unchanged:#64748b; --unchanged-fill:#263241; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme:dark; --bg:#0f172a; --surface:#111827; --surface-muted:#1f2937; --surface-selected:#1e3a5f; --border:#334155; --focus:#60a5fa; --text:#e5e7eb; --muted:#a5b4c7; --faint:#718096; --added:#4ade80; --added-fill:#123f2a; --deleted:#f87171; --deleted-fill:#4a1d23; --modified:#fbbf24; --modified-fill:#46330d; --unchanged:#64748b; --unchanged-fill:#263241; } }
    * { box-sizing:border-box; } body { margin:0; height:100vh; display:grid; grid-template-rows:auto 1fr; background:var(--bg); color:var(--text); font-size:14px; line-height:1.45; } header { display:flex; justify-content:space-between; gap:16px; align-items:center; padding:12px 20px; border-bottom:1px solid var(--border); background:var(--surface); } h1 { margin:0 0 2px; font-size:15px; font-weight:650; } .meta { color:var(--muted); font-size:12.5px; } .header-actions { display:flex; flex-direction:column; align-items:flex-end; gap:9px; } .filters { display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end; } .display-controls { display:flex; align-items:center; justify-content:flex-end; gap:8px; } button { font:inherit; cursor:pointer; } .filters button, .theme-toggle button, .panel-toggle, .panel-reopen { border:1px solid var(--border); background:var(--surface-muted); color:var(--muted); border-radius:999px; padding:5px 10px; font-size:12px; font-weight:600; } .filters button.active, .theme-toggle button[aria-pressed="true"] { background:var(--surface-selected); border-color:var(--focus); color:var(--text); } .theme-toggle { display:inline-flex; gap:2px; padding:2px; border:1px solid var(--border); border-radius:999px; background:var(--surface-muted); } .theme-toggle button { border:0; padding:3px 8px; } main { position:relative; display:grid; grid-template-columns:minmax(0,1fr) clamp(300px,var(--panel-width),70vw); min-height:0; } body.panel-collapsed main { grid-template-columns:minmax(0,1fr) 0; } .canvas { overflow:auto; padding:24px; position:relative; } .outline { max-width:1100px; margin:0 auto; } .outline-region { margin:0 0 13px; border:1px solid var(--border); border-left-width:4px; border-radius:9px; background:var(--surface); overflow:hidden; } .outline-region.added { border-left-color:var(--added); } .outline-region.deleted { border-left-color:var(--deleted); } .outline-region.modified { border-left-color:var(--modified); } .outline-region.unchanged { border-left-color:var(--unchanged); } .region-head { display:flex; align-items:center; gap:8px; padding:10px 13px; background:var(--surface-muted); font-weight:700; } .region-items { padding:7px 10px 10px 25px; } .outline-row { display:flex; align-items:center; gap:8px; margin:4px 0; padding:8px 10px; border:1px solid var(--border); border-radius:7px; background:var(--surface); cursor:pointer; } .outline-row:hover, .outline-row:focus-visible { border-color:var(--focus); outline:none; } .outline-row.added { background:var(--added-fill); border-color:color-mix(in srgb,var(--added) 45%,var(--border)); } .outline-row.deleted { background:var(--deleted-fill); border-color:color-mix(in srgb,var(--deleted) 45%,var(--border)); } .outline-row.modified { background:var(--modified-fill); border-color:color-mix(in srgb,var(--modified) 45%,var(--border)); } .facet-region { margin:8px 0 3px 22px; } .facet-region .region-head { font-size:12px; padding:7px 10px; } .facet-region .region-items { padding-left:14px; } .status-badge { min-width:68px; color:var(--muted); font-size:10px; font-weight:750; text-transform:uppercase; letter-spacing:.04em; } .added .status-badge { color:var(--added); } .deleted .status-badge { color:var(--deleted); } .modified .status-badge { color:var(--modified); } .summary-stat { margin-right:10px; } .summary-stat.added { color:var(--added); } .summary-stat.deleted { color:var(--deleted); } .summary-stat.modified { color:var(--modified); } .banner { margin:0 auto 16px; max-width:1100px; padding:11px 14px; border:1px solid var(--modified); border-radius:8px; background:var(--modified-fill); color:var(--modified); font-weight:750; } .panel { position:relative; min-width:0; border-left:1px solid var(--border); background:var(--surface); padding:20px; overflow:auto; } body.panel-collapsed .panel { padding:0; border-left:0; overflow:hidden; } body.panel-collapsed .panel > *:not(.panel-resizer) { display:none; } .panel-resizer { position:absolute; left:0; top:0; bottom:0; width:9px; transform:translateX(-50%); cursor:col-resize; z-index:2; } .panel-resizer:hover { background:var(--focus); opacity:.5; } .panel-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; } .panel h2 { margin:0 0 8px; font-size:15px; } .panel-toggle { border-radius:7px; padding:6px 9px; } .panel-reopen { display:none; position:absolute; top:14px; right:14px; z-index:3; border-radius:7px; } body.panel-collapsed .panel-reopen { display:block; } .panel-badge { display:inline-block; margin:0 0 15px; padding:3px 9px; border-radius:999px; background:var(--unchanged-fill); color:var(--muted); font-size:11px; font-weight:650; } .panel-badge.added { background:var(--added-fill); color:var(--added); } .panel-badge.deleted { background:var(--deleted-fill); color:var(--deleted); } .panel-badge.modified { background:var(--modified-fill); color:var(--modified); } .empty { color:var(--muted); font-size:13px; } .changes { list-style:none; margin:0; padding:0; } .changes li { margin:0 0 10px; } .change-path { display:block; margin-bottom:3px; color:var(--muted); font-size:11px; font-weight:700; } .val { padding:2px 5px; border-radius:4px; font:12px ui-monospace,Consolas,monospace; overflow-wrap:anywhere; } .val.before { color:var(--deleted); background:var(--deleted-fill); text-decoration:line-through; } .val.after { color:var(--added); background:var(--added-fill); } .arrow { color:var(--faint); margin:0 3px; } [hidden] { display:none !important; }
    .view-toggle { display:inline-flex; gap:2px; padding:2px; border:1px solid var(--border); border-radius:999px; background:var(--surface-muted); }
    .view-toggle button { border:1px solid var(--border); background:var(--surface-muted); color:var(--muted); border-radius:999px; padding:3px 8px; font-size:12px; font-weight:600; }
    .view-toggle button.active { background:var(--surface-selected); border-color:var(--focus); color:var(--text); }
    .view-canvas { min-height:100%; }
    /* The head script stamps data-view before first paint, so the active canvas is
       correct on the first frame. Without JS no attribute is set and the outline shows. */
    [data-view-canvas="wireframe"] { display:none; }
    :root[data-view="wireframe"] [data-view-canvas="wireframe"] { display:block; }
    :root[data-view="wireframe"] [data-view-canvas="outline"] { display:none; }
    .wireframe { max-width:1100px; margin:0 auto; }
    .wireframe-caption { margin:0 0 12px; color:var(--muted); font-size:12px; font-weight:650; }
    .wireframe-grid { display:grid; gap:12px; }
    .wireframe-grid-row, .wireframe-stack-row { display:grid; gap:12px; align-items:stretch; }
    .wireframe-cell { min-width:0; border:1px solid var(--border); border-radius:9px; background:var(--surface); overflow:hidden; }
    .wireframe-cell.added { border-color:var(--added); }
    .wireframe-cell.deleted { border-color:var(--deleted); }
    .wireframe-cell.modified { border-color:var(--modified); }
    .wireframe-cell.unchanged { border-color:var(--unchanged); }
    .wireframe-slot-head { display:flex; align-items:center; gap:8px; padding:9px 11px; background:var(--surface-muted); font-weight:700; }
    .wireframe-items { min-height:56px; padding:7px 10px 10px; }
    .wireframe-empty-label { display:block; padding:8px 2px; color:var(--faint); font-style:italic; }
    .wireframe-stack-cell { padding:0; }
    .wireframe-stack { display:grid; gap:12px; height:100%; }
    .wireframe-removed { margin-top:18px; padding:14px; border:1px dashed var(--deleted); border-radius:9px; background:var(--surface-muted); }
    .wireframe-removed h2 { margin:0 0 10px; font-size:14px; color:var(--deleted); }
    .wireframe-removed-region { margin-top:8px; border:1px solid var(--border); border-radius:7px; overflow:hidden; }
  </style>
</head>
<body>
  <header><div><h1>${productName} — ${title}</h1><div class="meta">${options.metaHtml}</div></div><div class="header-actions"><div class="filters" aria-label="View filters"><button class="filter-button active" data-view-mode="all">All</button><button class="filter-button" data-view-mode="after">After</button><button class="filter-button" data-view-mode="before">Before</button><button class="filter-button" data-view-mode="changes">Changes only</button></div><div class="display-controls">${options.wireframeHtml === undefined ? "" : `<div class="view-toggle" aria-label="Canvas view"><button class="view-button" data-view-mode="outline">Outline</button><button class="view-button" data-view-mode="wireframe">Wireframe</button></div>`}<div class="theme-toggle" aria-label="Theme"><button class="theme-button" data-theme-choice="system">System</button><button class="theme-button" data-theme-choice="light">Light</button><button class="theme-button" data-theme-choice="dark">Dark</button></div></div></div></header>
  <main><section class="canvas">${options.bannerHtml ?? ""}<div class="view-canvas" data-view-canvas="outline">${options.contentHtml}</div>${options.wireframeHtml === undefined ? "" : `<div class="view-canvas" data-view-canvas="wireframe">${options.wireframeHtml}</div>`}</section><aside class="panel" id="detail-panel"><div class="panel-resizer" id="panel-resizer"></div><div class="panel-head"><h2 id="panel-title">Select a component or field</h2><button class="panel-toggle" id="panel-toggle" type="button" aria-expanded="true" aria-label="Collapse details" title="Collapse details">›</button></div><div class="panel-badge" id="panel-badge" hidden></div><div id="panel-body" class="empty">Click a component or field row to inspect its property deltas.</div></aside><button class="panel-reopen" id="panel-reopen" type="button">Show details</button></main>
  <script>(() => { const viewKey = ${JSON.stringify(VIEW_STORAGE_KEY)}; const viewButtons = [...document.querySelectorAll('.view-button')]; const hasWireframe = viewButtons.length > 0; function applyViewMode(mode) { const selected = hasWireframe && mode === "wireframe" ? "wireframe" : "outline"; document.documentElement.dataset.view = selected; viewButtons.forEach((button) => button.classList.toggle('active', button.dataset.viewMode === selected)); } viewButtons.forEach((button) => button.addEventListener('click', () => { const mode = button.dataset.viewMode; applyViewMode(mode); try { localStorage.setItem(viewKey, mode); } catch {} })); applyViewMode(document.documentElement.dataset.view ?? "outline"); })(); (() => { ${options.clientScript} })();</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
