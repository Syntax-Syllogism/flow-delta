import type { PropertyChange } from "../diff/deep-diff.ts";
import { renderShell } from "../render/shell.ts";
import type { ItemDiff, PageDiff, RegionDiff } from "./diff-page.ts";
import { escapeHtml, itemFacetRefs, renderItem } from "./render-helpers.ts";
import { getWireframeRollups, regionChangeId, renderWireframe } from "./render-wireframe.ts";
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
  const data = Object.fromEntries([
    ...diff.regions.flatMap((region) => region.items.map((item) => [item.id, item] as const)),
    ...diff.regions.flatMap((region) => region.changes?.length ? [[regionChangeId(region), {
      id: regionChangeId(region),
      path: region.path,
      kind: "region",
      status: region.status,
      componentName: region.name.split(" › ").at(-1)?.match(/\(([^()]+)\)$/)?.[1] ?? region.name.split(" › ").at(-1) ?? region.name,
      changes: region.changes,
    }] as const] : []),
  ]);
  const rollups = getWireframeRollups(diff);
  const json = JSON.stringify({ items: data, rollups }).replace(/</g, "\\u003c");
  const clientScript = `const DATA = ${json};
    const rows = [...document.querySelectorAll('.outline-row')];
    const regions = [...document.querySelectorAll('[data-region-status]')];
    const filters = [...document.querySelectorAll('.filter-button')];
    const panelTitle = document.getElementById('panel-title');
    const panelBadge = document.getElementById('panel-badge');
    const panelBody = document.getElementById('panel-body');
    const panelBack = document.getElementById('panel-back');
    let activeDigestRegion;
    function changed(el) { return el.dataset.regionStatus !== 'unchanged' || el.querySelector('.outline-row:not(.unchanged)') !== null; }
    function applyView(mode) {
      filters.forEach((button) => button.classList.toggle('active', button.dataset.viewMode === mode));
      rows.forEach((row) => { const status = row.dataset.status; row.hidden = mode === 'after' ? status === 'deleted' : mode === 'before' ? status === 'added' : mode === 'changes' ? status === 'unchanged' : false; });
      regions.forEach((region) => { const wireframeCell = region.classList.contains('wireframe-cell'); region.hidden = mode === 'after' ? region.dataset.regionStatus === 'deleted' : mode === 'before' ? region.dataset.regionStatus === 'added' : mode === 'changes' ? !wireframeCell && !changed(region) : false; });
    }
    filters.forEach((button) => button.addEventListener('click', () => applyView(button.dataset.viewMode)));
    function text(value) { return value === undefined ? '(missing)' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
    function escape(value) { return text(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
    function renderValue(before, after) { if (before === undefined) return '<span class="val after">' + escape(after) + '</span>'; if (after === undefined) return '<span class="val before">' + escape(before) + '</span>'; return '<span class="val before">' + escape(before) + '</span><span class="arrow">→</span><span class="val after">' + escape(after) + '</span>'; }
    function selectItem(id, fromDigest = false) { const item = DATA.items[id]; if (!item) return; if (!fromDigest) { activeDigestRegion = undefined; panelBack.hidden = true; } else { panelBack.hidden = false; panelBack.textContent = 'Back to ' + activeDigestRegion + ' changes'; } const title = item.componentName || item.fieldItem || 'Item'; panelTitle.textContent = title; panelBadge.hidden = false; panelBadge.textContent = item.status; panelBadge.className = 'panel-badge ' + item.status; const location = item.path ? '<div class="item-path">' + escape(item.path) + '</div>' : ''; const notes = item.notes?.length ? '<ul class="item-notes">' + item.notes.map((note) => '<li>' + escape(note) + '</li>').join('') + '</ul>' : ''; if (!item.changes || item.changes.length === 0) { if (item.status === 'unchanged' && !notes) { panelBody.className = 'empty'; panelBody.textContent = 'No property changes.'; } else { panelBody.className = 'empty'; panelBody.innerHTML = location + notes + '<div>' + (item.status === 'unchanged' ? 'No property changes.' : 'No property details available.') + '</div>'; } return; } panelBody.className = ''; panelBody.innerHTML = location + notes + '<ul class="changes">' + item.changes.map((change) => '<li><span class="change-path">' + escape(change.path) + '</span>' + renderValue(change.before, change.after) + '</li>').join('') + '</ul>'; }
    function selectRow(row) { selectItem(row.dataset.itemId); }
    function digestEntry(id) { const item = DATA.items[id]; if (!item) return ''; const label = item.componentName || item.fieldItem || 'Item'; return '<button class="digest-entry ' + item.status + '" type="button" data-digest-item-id="' + escape(id) + '"><span class="status-badge ' + item.status + '">' + escape(item.status) + '</span><span>' + escape(label) + '</span></button>'; }
    function showDigest(regionName) { const rollup = DATA.rollups[regionName]; if (!rollup) return; document.body.classList.remove('panel-collapsed'); document.getElementById('panel-toggle')?.setAttribute('aria-expanded','true'); activeDigestRegion = regionName; panelTitle.textContent = regionName + ' changes'; panelBadge.hidden = true; panelBack.hidden = true; panelBody.className = ''; panelBody.innerHTML = '<div class="digest">' + rollup.groups.map((group) => '<section class="digest-group"><div class="digest-group-head"><span>' + escape(group.label) + '</span><span class="digest-group-count">' + group.itemIds.length + ' ' + (group.itemIds.length === 1 ? 'change' : 'changes') + '</span></div>' + group.itemIds.map(digestEntry).join('') + '</section>').join('') + '</div>'; panelBody.querySelectorAll('[data-digest-item-id]').forEach((entry) => entry.addEventListener('click', () => selectItem(entry.dataset.digestItemId, true))); }
    rows.forEach((row) => { row.addEventListener('click', () => selectRow(row)); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(row); } }); });
    document.querySelectorAll('.wireframe-rollup').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); showDigest(button.dataset.rollupRegion); }));
    panelBack.addEventListener('click', () => { if (activeDigestRegion) showDigest(activeDigestRegion); });
    const themeButtons = [...document.querySelectorAll('.theme-button')];
    function applyTheme(theme) { document.documentElement.dataset.theme = theme; themeButtons.forEach((button) => button.setAttribute('aria-pressed', button.dataset.themeChoice === theme ? 'true' : 'false')); }
    function storedTheme() { try { const value = localStorage.getItem(${JSON.stringify("flow-delta-theme")}); return ['system','light','dark'].includes(value) ? value : 'system'; } catch { return 'system'; } }
    themeButtons.forEach((button) => button.addEventListener('click', () => { const theme = button.dataset.themeChoice; applyTheme(theme); try { localStorage.setItem(${JSON.stringify("flow-delta-theme")}, theme); } catch {} }));
    applyTheme(storedTheme()); applyView('all');
    const panelToggle = document.getElementById('panel-toggle'); const panelReopen = document.getElementById('panel-reopen'); panelToggle.addEventListener('click', () => { document.body.classList.add('panel-collapsed'); panelToggle.setAttribute('aria-expanded','false'); }); panelReopen.addEventListener('click', () => { document.body.classList.remove('panel-collapsed'); panelToggle.setAttribute('aria-expanded','true'); });
    const resizer = document.getElementById('panel-resizer'); let resizeStart; resizer.addEventListener('pointerdown', (event) => { resizeStart = { x:event.clientX, width:document.getElementById('detail-panel').getBoundingClientRect().width }; resizer.setPointerCapture(event.pointerId); }); resizer.addEventListener('pointermove', (event) => { if (!resizeStart) return; document.documentElement.style.setProperty('--panel-width', Math.max(300, resizeStart.width - (event.clientX - resizeStart.x)) + 'px'); }); resizer.addEventListener('pointerup', () => { resizeStart = undefined; });`;
  const wireframe = renderWireframe(diff, getTemplateGeometry(options.template), rollups);
  return renderShell({ title: diff.pageName, productName: "FlexiPageDelta", metaHtml, bannerHtml, contentHtml: content, wireframeHtml: wireframe ?? undefined, defaultView: wireframe ? "wireframe" : "outline", clientScript });
}

function renderInlineValue(value: unknown): string {
  return escapeHtml(value === undefined ? "(missing)" : String(value));
}
