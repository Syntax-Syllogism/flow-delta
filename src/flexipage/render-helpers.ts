import type { ItemDiff } from "./diff-page.ts";

export function renderItem(item: ItemDiff): string {
  const label = item.componentName ?? item.fieldItem ?? "Item";
  return `<div class="outline-row ${item.status}" data-status="${item.status}" data-item-id="${escapeHtml(item.id)}" tabindex="0" role="button"><span class="status-badge">${item.status}</span><span>${escapeHtml(label)}</span></div>`;
}

export function itemFacetRefs(item: ItemDiff): string[] {
  const value = item.after ?? item.before;
  return value?.kind === "component" ? value.facetRefs : [];
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
