import type { PropertyChange } from "../diff/deep-diff.ts";
import { renderShell } from "../render/shell.ts";
import type { ItemDiff, PageDiff, RegionDiff } from "./diff-page.ts";
import { escapeHtml, itemFacetRefs, renderItem } from "./render-helpers.ts";
import { renderWireframe } from "./render-wireframe.ts";
import { getTemplateGeometry } from "./template-geometry.ts";

export interface RenderOptions {
  template?: string;
}

export function renderOutline(diff: PageDiff, options: RenderOptions = {}): string {
  const referenced = new Set<string>();
  for (const region of diff.regions) {
    for (const item of region.items) {
      const value = item.after ?? item.before;
      if (value?.kind === "component") value.facetRefs.forEach((ref) => referenced.add(ref));
    }
  }
  const regions = new Map(diff.regions.map((region) => [region.name, region]));
  const rendered = new Set<string>();
  const renderRegion = (region: RegionDiff, facet = false): string => {
    if (rendered.has(region.name)) return "";
    rendered.add(region.name);
    const items = region.items.map((item) => {
      const nested = itemFacetRefs(item).map((ref) => {
        const child = regions.get(ref);
        return child ? renderRegion(child, true) : "";
      }).join("");
      return renderItem(item) + nested;
    }).join("");
    return `<section class="outline-region ${facet ? "facet-region " : ""}${region.status}" data-region-status="${region.status}">
      <div class="region-head"><span class="status-badge">${region.status}</span><span>${escapeHtml(region.name)}</span></div>
      <div class="region-items">${items}</div>
    </section>`;
  };
  const content = [...diff.regions.filter((region) => !referenced.has(region.name)), ...diff.regions.filter((region) => referenced.has(region.name))]
    .map((region) => renderRegion(region)).join("");
  const summary = diff.summary;
  const metaHtml = `<span class="summary-stat added">+${summary.addedComponents} components</span><span class="summary-stat deleted">−${summary.removedComponents} components</span><span class="summary-stat modified">~${summary.modifiedComponents} components</span><span class="summary-stat">+${summary.addedRegions}/−${summary.removedRegions} regions</span><span class="summary-stat">${summary.changedPageAttributes} page attributes</span>`;
  const templateChange = diff.pageChanges?.find((change) => change.path === "template");
  const bannerHtml = templateChange ? `<div class="banner">Template changed: ${renderInlineValue(templateChange.before)} → ${renderInlineValue(templateChange.after)}</div>` : "";
  const data = Object.fromEntries(diff.regions.flatMap((region) => region.items.map((item) => [item.id, item])));
  const json = JSON.stringify({ items: data }).replace(/</g, "\\u003c");
  const clientScript = `const DATA = ${json};
    const rows = [...document.querySelectorAll('.outline-row')];
    const regions = [...document.querySelectorAll('[data-region-status]')];
    const filters = [...document.querySelectorAll('.filter-button')];
    function changed(el) { return el.dataset.regionStatus !== 'unchanged' || el.querySelector('.outline-row.added,.outline-row.deleted,.outline-row.modified') !== null; }
    function applyView(mode) {
      filters.forEach((button) => button.classList.toggle('active', button.dataset.viewMode === mode));
      rows.forEach((row) => { const status = row.dataset.status; row.hidden = mode === 'after' ? status === 'deleted' : mode === 'before' ? status === 'added' : mode === 'changes' ? status === 'unchanged' : false; });
      regions.forEach((region) => { const wireframeCell = region.classList.contains('wireframe-cell'); region.hidden = mode === 'after' ? region.dataset.regionStatus === 'deleted' : mode === 'before' ? region.dataset.regionStatus === 'added' : mode === 'changes' ? !wireframeCell && !changed(region) : false; });
    }
    filters.forEach((button) => button.addEventListener('click', () => applyView(button.dataset.viewMode)));
    function text(value) { return value === undefined ? '(missing)' : String(value); }
    function escape(value) { return text(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
    function renderValue(before, after) { if (before === undefined) return '<span class="val after">' + escape(after) + '</span>'; if (after === undefined) return '<span class="val before">' + escape(before) + '</span>'; return '<span class="val before">' + escape(before) + '</span><span class="arrow">→</span><span class="val after">' + escape(after) + '</span>'; }
    function selectRow(row) { const item = DATA.items[row.dataset.itemId]; if (!item) return; const title = item.componentName || item.fieldItem || 'Item'; const badge = document.getElementById('panel-badge'); document.getElementById('panel-title').textContent = title; badge.hidden = false; badge.textContent = item.status; badge.className = 'panel-badge ' + item.status; const body = document.getElementById('panel-body'); if (!item.changes || item.changes.length === 0) { body.className = 'empty'; body.textContent = item.status === 'unchanged' ? 'No property changes.' : 'No property details available.'; return; } body.className = ''; body.innerHTML = '<ul class="changes">' + item.changes.map((change) => '<li><span class="change-path">' + escape(change.path) + '</span>' + renderValue(change.before, change.after) + '</li>').join('') + '</ul>'; }
    rows.forEach((row) => { row.addEventListener('click', () => selectRow(row)); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(row); } }); });
    const themeButtons = [...document.querySelectorAll('.theme-button')];
    function applyTheme(theme) { document.documentElement.dataset.theme = theme; themeButtons.forEach((button) => button.setAttribute('aria-pressed', button.dataset.themeChoice === theme ? 'true' : 'false')); }
    function storedTheme() { try { const value = localStorage.getItem(${JSON.stringify("flow-delta-theme")}); return ['system','light','dark'].includes(value) ? value : 'system'; } catch { return 'system'; } }
    themeButtons.forEach((button) => button.addEventListener('click', () => { const theme = button.dataset.themeChoice; applyTheme(theme); try { localStorage.setItem(${JSON.stringify("flow-delta-theme")}, theme); } catch {} }));
    applyTheme(storedTheme()); applyView('all');
    const panelToggle = document.getElementById('panel-toggle'); const panelReopen = document.getElementById('panel-reopen'); panelToggle.addEventListener('click', () => { document.body.classList.add('panel-collapsed'); panelToggle.setAttribute('aria-expanded','false'); }); panelReopen.addEventListener('click', () => { document.body.classList.remove('panel-collapsed'); panelToggle.setAttribute('aria-expanded','true'); });
    const resizer = document.getElementById('panel-resizer'); let resizeStart; resizer.addEventListener('pointerdown', (event) => { resizeStart = { x:event.clientX, width:document.getElementById('detail-panel').getBoundingClientRect().width }; resizer.setPointerCapture(event.pointerId); }); resizer.addEventListener('pointermove', (event) => { if (!resizeStart) return; document.documentElement.style.setProperty('--panel-width', Math.max(300, resizeStart.width - (event.clientX - resizeStart.x)) + 'px'); }); resizer.addEventListener('pointerup', () => { resizeStart = undefined; });`;
  const wireframe = renderWireframe(diff, getTemplateGeometry(options.template));
  return renderShell({ title: diff.pageName, productName: "FlexiPageDelta", metaHtml, bannerHtml, contentHtml: content, wireframeHtml: wireframe ?? undefined, defaultView: wireframe ? "wireframe" : "outline", clientScript });
}

function renderInlineValue(value: unknown): string {
  return escapeHtml(value === undefined ? "(missing)" : String(value));
}
