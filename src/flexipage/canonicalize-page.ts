import { createHash } from "node:crypto";
import type { ComponentItem, Item, PageModel, PropertyValue, Region } from "./page-model.ts";

const FACET_GUID = /^Facet-[0-9a-f-]{36}$/i;

export function canonicalizePageModel(model: PageModel): PageModel {
  const rawRegions = model.regions;
  const facets = new Map(rawRegions.filter((region) => region.type === "Facet").map((region) => [region.name, region]));
  const canonicalNames = new Map<string, string>();

  for (const region of rawRegions.filter((candidate) => candidate.type === "Region")) {
    resolveFacetChildren(region, region.name);
  }

  const orphanCounts = new Map<string, number>();
  for (const facet of rawRegions.filter((candidate) => candidate.type === "Facet" && FACET_GUID.test(candidate.name))) {
    if (canonicalNames.has(facet.name)) continue;
    const base = `Facet:orphan:${facetHash(facet)}`;
    const count = orphanCounts.get(base) ?? 0;
    const name = count === 0 ? base : `${base}#${count + 1}`;
    orphanCounts.set(base, count + 1);
    canonicalNames.set(facet.name, name);
  }
  const canonicalFacetNames = new Set(canonicalNames.values());

  const regions = rawRegions.map((region) => ({
    ...region,
    name: canonicalNames.get(region.name) ?? region.name,
    items: region.items.map((item) => {
      if (item.kind !== "component") return item;
      const properties = Object.fromEntries(Object.entries(item.properties).map(([key, value]) => [key, mapFacetValues(value)]));
      return {
        ...item,
        properties,
        facetRefs: [...new Set(Object.values(properties).flatMap((value) => collectFacetRefs(value)))],
      } satisfies ComponentItem;
    }),
  }));

  const names = regions.map((region) => region.name);
  if (names.length !== new Set(names).size) {
    throw new Error("FlexiPage canonicalization produced duplicate region names");
  }

  return { ...model, regions };

  function resolveFacetChildren(parent: Region, parentPath: string): void {
    const siblingCounts = new Map<string, number>();
    for (const item of parent.items) {
      if (item.kind !== "component") continue;
      for (const [property, value] of Object.entries(item.properties)) {
        for (const facetName of collectRawFacetRefs(value)) {
          const child = facets.get(facetName);
          if (!child || !FACET_GUID.test(facetName)) continue;
          let childPath = canonicalNames.get(facetName);
          if (!childPath) {
            const base = `${parentPath} › ${componentLabel(item)} › ${property}`;
            const count = siblingCounts.get(base) ?? 0;
            siblingCounts.set(base, count + 1);
            childPath = count === 0 ? base : `${base}#${count + 1}`;
            canonicalNames.set(facetName, childPath);
            resolveFacetChildren(child, childPath);
          }
        }
      }
    }
  }

  function mapFacetValues(value: PropertyValue): PropertyValue {
    if (typeof value === "string") return canonicalNames.get(value) ?? value;
    if (Array.isArray(value)) return value.map(mapFacetValues);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, mapFacetValues(child)]));
  }

  function collectRawFacetRefs(value: PropertyValue): string[] {
    if (typeof value === "string") return facets.has(value) ? [value] : [];
    if (Array.isArray(value)) return value.flatMap(collectRawFacetRefs);
    return Object.values(value).flatMap(collectRawFacetRefs);
  }

  function collectFacetRefs(value: PropertyValue): string[] {
    if (typeof value === "string") {
      const canonical = canonicalNames.get(value);
      if (canonical) return [canonical];
      if (facets.has(value)) return [value];
      return canonicalFacetNames.has(value) ? [value] : [];
    }
    if (Array.isArray(value)) return value.flatMap(collectFacetRefs);
    return Object.values(value).flatMap(collectFacetRefs);
  }
}

function facetHash(region: Region): string {
  const stable = {
    type: region.type,
    mode: region.mode,
    items: region.items.map((item) => item.kind === "component"
      ? { kind: item.kind, componentName: item.componentName, identifier: item.identifier, properties: item.properties }
      : { kind: item.kind, fieldItem: item.fieldItem, identifier: item.identifier, attributes: item.attributes }),
  };
  return createHash("sha1").update(JSON.stringify(stable)).digest("hex").slice(0, 12);
}

function componentLabel(item: ComponentItem): string {
  const identity = item.identifier ? `${item.componentName}#${item.identifier}` : item.componentName;
  const label = ["title", "label", "name"]
    .map((key) => item.properties[key])
    .find((value): value is string => typeof value === "string" && value.length > 0);
  return label && label !== item.componentName ? `${identity} (${label})` : identity;
}
