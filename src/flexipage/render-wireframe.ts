import type { PageDiff, RegionDiff } from "./diff-page.ts";
import { escapeHtml, itemFacetRefs, renderItem } from "./render-helpers.ts";
import { validateTemplateGeometry, type LayoutCell, type LayoutRow, type SlotGeometry, type StackGeometry, type TemplateGeometry } from "./template-geometry.ts";

export interface WireframeDigestGroup {
  label: string;
  itemIds: string[];
}

export interface WireframeRollup {
  count: number;
  itemIds: string[];
  groups: WireframeDigestGroup[];
}

export type WireframeRollups = Record<string, WireframeRollup>;

export function getWireframeRollups(diff: PageDiff): WireframeRollups {
  const rollups = new Map<string, { itemIds: string[]; groups: Map<string, string[]> }>();
  const addEntry = (root: string, group: string, id: string): void => {
    const rollup = rollups.get(root) ?? { itemIds: [], groups: new Map<string, string[]>() };
    rollup.itemIds.push(id);
    const groupItems = rollup.groups.get(group) ?? [];
    groupItems.push(id);
    rollup.groups.set(group, groupItems);
    rollups.set(root, rollup);
  };
  for (const region of diff.regions) {
    if (!region.changes?.length) continue;
    const segments = region.path.split(" › ");
    const root = segments[0];
    addEntry(root, digestGroupLabel([...segments, "__region__"], root), regionChangeId(region));
  }
  for (const item of diff.regions.flatMap((region) => region.items)) {
    if (item.status === "unchanged") continue;
    const segments = item.path.split(" › ");
    const root = segments[0];
    addEntry(root, digestGroupLabel(segments, root), item.id);
  }
  return Object.fromEntries([...rollups.entries()].map(([region, value]) => [region, {
    count: value.itemIds.length,
    itemIds: value.itemIds,
    groups: [...value.groups.entries()].map(([label, itemIds]) => ({ label, itemIds })),
  }]));
}

export function regionChangeId(region: RegionDiff): string {
  return `region:${region.name}`;
}

export function renderWireframe(diff: PageDiff, geometry: TemplateGeometry | undefined, rollups = getWireframeRollups(diff)): string | undefined {
  if (!geometry) return undefined;
  validateTemplateGeometry(geometry);
  const slots = geometry.rows.flatMap((row) => row.flatMap(slotsInCell));
  const slotNames = new Set(slots);
  const currentRegions = diff.regions.filter((region) => region.type === "Region" && region.status !== "deleted");
  if (slots.length !== slotNames.size || currentRegions.some((region) => !slotNames.has(region.name))) return undefined;

  const regions = new Map(diff.regions.map((region) => [region.name, region]));
  const referenced = new Set<string>();
  for (const region of diff.regions) for (const item of region.items) itemFacetRefs(item).forEach((ref) => referenced.add(ref));
  const renderedFacets = new Set<string>();
  const renderRegionItems = (region: RegionDiff): string => region.items.map((item) => {
    const nested = itemFacetRefs(item).map((ref) => {
      const facet = regions.get(ref);
      if (!facet || renderedFacets.has(facet.name)) return "";
      renderedFacets.add(facet.name);
      return renderFacet(facet);
    }).join("");
    return renderItem(item) + nested;
  }).join("");
  const renderSlot = (slot: string): string => {
    const region = regions.get(slot);
    const status = region?.status ?? "unchanged";
    const rollup = rollups[slot];
    const rollupMarkup = rollup ? `<button class="wireframe-rollup" type="button" data-rollup-region="${escapeHtml(slot)}" aria-label="${rollup.count} changes in ${escapeHtml(slot)}">${rollup.count} ${rollup.count === 1 ? "change" : "changes"}</button>` : "";
    return `<div class="wireframe-cell${region ? ` ${status}` : " wireframe-empty"}" data-region-status="${status}" data-slot="${escapeHtml(slot)}"><div class="wireframe-slot-head"><span class="status-badge">${status}</span><span>${escapeHtml(slot)}</span>${rollupMarkup}</div><div class="wireframe-items">${region ? renderRegionItems(region) : '<span class="wireframe-empty-label">Empty slot</span>'}</div></div>`;
  };
  const renderCell = (cell: LayoutCell): string => {
    if (isStack(cell)) return `<div class="wireframe-cell wireframe-stack-cell"><div class="wireframe-stack">${cell.stack.map((child) => Array.isArray(child) ? renderNestedRow(child) : renderSlot(child.slot)).join("")}</div></div>`;
    return renderSlot(cell.slot);
  };
  const renderRow = (row: LayoutRow, className = "wireframe-grid-row"): string => `<div class="${className}" style="grid-template-columns:${row.map((cell) => `${cellWidth(cell)}fr`).join(" ")}">${row.map(renderCell).join("")}</div>`;
  const renderNestedRow = (row: LayoutRow): string => renderRow(row, "wireframe-stack-row");
  const grid = geometry.rows.map((row) => renderRow(row)).join("");
  const removed = diff.regions.filter((region) => region.type === "Region" && region.status === "deleted" && !slotNames.has(region.name));
  const unplacedFacets = diff.regions.filter((region) => region.type === "Facet" && !referenced.has(region.name));
  const removedMarkup = removed.length === 0 ? "" : `<section class="wireframe-removed"><h2>Removed (not in current template)</h2>${removed.map(renderAppendixRegion).join("")}</section>`;
  const facetMarkup = unplacedFacets.length === 0 ? "" : `<section class="wireframe-unplaced"><h2>Unplaced facet regions</h2>${unplacedFacets.map(renderAppendixRegion).join("")}</section>`;
  return `<div class="wireframe" data-template-label="${escapeHtml(geometry.label)}"><div class="wireframe-caption">Template geometry: ${escapeHtml(geometry.label)}</div><div class="wireframe-grid">${grid}</div>${removedMarkup}${facetMarkup}</div>`;

  function renderAppendixRegion(region: RegionDiff): string {
    return `<div class="wireframe-removed-region" data-region-status="${region.status}"><div class="wireframe-slot-head"><span class="status-badge">${region.status}</span><span>${escapeHtml(region.name)}</span></div><div class="wireframe-items">${renderRegionItems(region)}</div></div>`;
  }
}

function digestGroupLabel(segments: string[], root: string): string {
  const ancestor = [...segments.slice(1, -1)].reverse().find((segment) => /\([^()]+\)$/.test(segment));
  return ancestor?.match(/\(([^()]+)\)$/)?.[1] ?? segments.at(-2) ?? root;
}

function slotsInCell(cell: LayoutCell): string[] {
  if (!isStack(cell)) return [cell.slot];
  return cell.stack.flatMap((child) => Array.isArray(child) ? child.flatMap(slotsInCell) : [child.slot]);
}

function cellWidth(cell: LayoutCell | SlotGeometry): number {
  return cell.widthPercent ?? 100;
}

function isStack(cell: LayoutCell): cell is StackGeometry {
  return "stack" in cell;
}

function renderFacet(region: RegionDiff): string {
  return `<section class="facet-region" data-region-status="${region.status}"><div class="region-head"><span class="status-badge">${region.status}</span><span>${escapeHtml(region.name)}</span></div><div class="region-items">${region.items.map(renderItem).join("")}</div></section>`;
}
