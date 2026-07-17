import { deepDiff, type PropertyChange } from "../diff/deep-diff.ts";
import type { ComponentItem, Item, PageModel, Region } from "./page-model.ts";

export type PageStatus = "added" | "deleted" | "modified" | "unchanged";

export interface ItemDiff {
  id: string;
  kind: Item["kind"];
  status: PageStatus;
  componentName?: string;
  fieldItem?: string;
  changes?: PropertyChange[];
  before?: Item;
  after?: Item;
}

export interface RegionDiff {
  name: string;
  type: Region["type"];
  mode?: Region["mode"];
  status: PageStatus;
  changes?: PropertyChange[];
  items: ItemDiff[];
}

export interface PageDiff {
  pageName: string;
  kind: "flexipage";
  summary: {
    addedComponents: number;
    removedComponents: number;
    modifiedComponents: number;
    unchangedComponents: number;
    addedRegions: number;
    removedRegions: number;
    modifiedRegions: number;
    changedPageAttributes: number;
  };
  pageChanges?: PropertyChange[];
  regions: RegionDiff[];
}

const HEADER_ORDER = ["masterLabel", "template", "sobjectType", "type", "parentFlexiPage", "description"];

export function diffPage(oldModel: PageModel, newModel: PageModel): PageDiff {
  const oldRegions = new Map(oldModel.regions.map((region) => [region.name, region]));
  const newRegions = new Map(newModel.regions.map((region) => [region.name, region]));
  const names = [...new Set([...newModel.regions.map((region) => region.name), ...oldModel.regions.map((region) => region.name)])];
  const regions = names.map((name) => diffRegion(name, oldRegions.get(name), newRegions.get(name)));
  const pageChanges = oldModel.header && newModel.header && Object.keys(oldModel.header).length > 0 && Object.keys(newModel.header).length > 0
    ? deepDiff(oldModel.header, newModel.header).sort((left, right) => orderOf(left.path) - orderOf(right.path))
    : [];
  const items = regions.flatMap((region) => region.items);

  return {
    pageName: selectPageName(oldModel, newModel),
    kind: "flexipage",
    summary: {
      addedComponents: items.filter((item) => item.status === "added").length,
      removedComponents: items.filter((item) => item.status === "deleted").length,
      modifiedComponents: items.filter((item) => item.status === "modified").length,
      unchangedComponents: items.filter((item) => item.status === "unchanged").length,
      addedRegions: regions.filter((region) => region.status === "added").length,
      removedRegions: regions.filter((region) => region.status === "deleted").length,
      modifiedRegions: regions.filter((region) => (region.changes?.length ?? 0) > 0).length,
      changedPageAttributes: pageChanges.length,
    },
    ...(pageChanges.length ? { pageChanges } : {}),
    regions,
  };
}

function diffRegion(name: string, oldRegion: Region | undefined, newRegion: Region | undefined): RegionDiff {
  if (!oldRegion) return { name, type: newRegion!.type, mode: newRegion!.mode, status: "added", items: newRegion!.items.map((item, index) => classifyItem(undefined, item, `${name}:after:${index}`)) };
  if (!newRegion) return { name, type: oldRegion.type, mode: oldRegion.mode, status: "deleted", items: oldRegion.items.map((item, index) => classifyItem(item, undefined, `${name}:before:${index}`)) };
  const items = diffItems(oldRegion.items, newRegion.items, name);
  const regionChanges = deepDiff({ type: oldRegion.type, mode: oldRegion.mode }, { type: newRegion.type, mode: newRegion.mode });
  return { name, type: newRegion.type, mode: newRegion.mode, status: regionChanges.length || items.some((item) => item.status !== "unchanged") ? "modified" : "unchanged", ...(regionChanges.length ? { changes: regionChanges } : {}), items };
}

function diffItems(oldItems: Item[], newItems: Item[], regionName: string): ItemDiff[] {
  const pairs = lcs(oldItems, newItems);
  const output: ItemDiff[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (const [matchOld, matchNew] of pairs) {
    while (oldIndex < matchOld) output.push(classifyItem(oldItems[oldIndex], undefined, `${regionName}:before:${oldIndex++}`));
    while (newIndex < matchNew) output.push(classifyItem(undefined, newItems[newIndex], `${regionName}:after:${newIndex++}`));
    output.push(classifyItem(oldItems[matchOld], newItems[matchNew], `${regionName}:${matchNew}`));
    oldIndex = matchOld + 1;
    newIndex = matchNew + 1;
  }
  while (oldIndex < oldItems.length) output.push(classifyItem(oldItems[oldIndex], undefined, `${regionName}:before:${oldIndex++}`));
  while (newIndex < newItems.length) output.push(classifyItem(undefined, newItems[newIndex], `${regionName}:after:${newIndex++}`));
  return output;
}

function classifyItem(before: Item | undefined, after: Item | undefined, id: string): ItemDiff {
  const item = after ?? before!;
  const base = item.kind === "component"
    ? { id, kind: item.kind, componentName: item.componentName }
    : { id, kind: item.kind, fieldItem: item.fieldItem };
  if (!before) return { ...base, status: "added", after };
  if (!after) return { ...base, status: "deleted", before };
  const changes = before.kind === "component" && after.kind === "component"
    ? deepDiff(before.properties, after.properties)
    : deepDiff(before, after);
  return changes.length ? { ...base, status: "modified", changes, before, after } : { ...base, status: "unchanged", after };
}

function lcs(oldItems: Item[], newItems: Item[]): Array<[number, number]> {
  const table = Array.from({ length: oldItems.length + 1 }, () => Array<number>(newItems.length + 1).fill(0));
  for (let oldIndex = oldItems.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newItems.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] = itemKey(oldItems[oldIndex]) === itemKey(newItems[newIndex])
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }
  const matches: Array<[number, number]> = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldItems.length && newIndex < newItems.length) {
    if (itemKey(oldItems[oldIndex]) === itemKey(newItems[newIndex])) {
      matches.push([oldIndex++, newIndex++]);
    } else if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }
  return matches;
}

function itemKey(item: Item): string {
  return item.kind === "component" ? `component:${item.componentName}` : `field:${item.fieldItem}`;
}

function orderOf(path: string): number {
  const index = HEADER_ORDER.indexOf(path);
  return index >= 0 ? index : HEADER_ORDER.length;
}

function selectPageName(oldModel: PageModel, newModel: PageModel): string {
  return newModel.pageName !== "(unknown)" ? newModel.pageName : oldModel.pageName;
}
