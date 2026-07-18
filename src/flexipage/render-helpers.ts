import type { ItemDiff } from "./diff-page.ts";

export function renderItem(item: ItemDiff): string {
  const label = item.componentName ?? item.fieldItem ?? "Item";
  const notes = item.notes?.map((note) => `<span class="item-note">${escapeHtml(note)}</span>`).join("") ?? "";
  return `<div class="outline-row ${item.status}" data-status="${item.status}" data-item-id="${escapeHtml(item.id)}" data-item-path="${escapeHtml(item.path)}" tabindex="0" role="button"><span class="status-badge">${item.status}</span><span>${escapeHtml(label)}</span>${notes}</div>`;
}

export function itemFacetRefs(item: ItemDiff): string[] {
  const value = item.after ?? item.before;
  return value?.kind === "component" ? value.facetRefs : [];
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
