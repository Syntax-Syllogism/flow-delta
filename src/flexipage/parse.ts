import { Parser } from "xml2js";
import { createHash } from "node:crypto";
import type { ComponentItem, FieldItem, Item, PageHeader, PageModel, PropertyValue, Region } from "./page-model.ts";

const FACET_GUID = /^Facet-[0-9a-f-]{36}$/i;
const HEADER_KEYS = ["masterLabel", "type", "sobjectType", "parentFlexiPage", "description"] as const;
const ALWAYS_LIST_KEYS = new Set(["criteria"]);

export async function parseFlexiPage(xml: string): Promise<PageModel> {
  const parsed = await new Parser({ explicitArray: true, trim: true, normalize: false }).parseStringPromise(xml) as {
    FlexiPage?: Record<string, unknown[]>;
  };
  const page = parsed.FlexiPage;
  if (!page) {
    throw new Error("Expected a FlexiPage root element");
  }

  const header: PageHeader = {};
  for (const key of HEADER_KEYS) {
    const value = scalar(page[key]);
    if (value !== undefined) header[key] = value;
  }
  const template = objectAt(page.template)?.name;
  if (template !== undefined) header.template = scalar(template);

  const fullName = scalar(page.fullName);
  const regions = arrayAt(page.flexiPageRegions).map(parseRegion);
  return canonicalize({
    pageName: header.masterLabel ?? fullName ?? "(unknown)",
    header,
    regions,
  });
}

function parseRegion(value: unknown): Region {
  const region = objectValue(value);
  const type = scalar(region.type) === "Facet" ? "Facet" : "Region";
  const mode = scalar(region.mode);
  return {
    name: scalar(region.name) ?? "(unnamed)",
    type,
    ...(mode === "Replace" || mode === "Append" || mode === "Prepend" ? { mode } : {}),
    items: arrayAt(region.itemInstances).flatMap(parseItemInstance),
  };
}

function parseItemInstance(value: unknown): Item[] {
  const instance = objectValue(value);
  const component = objectAt(instance.componentInstance);
  if (component) {
    const properties = arrayAt(component.componentInstanceProperties)
      .map((entry) => objectValue(entry))
      .map((entry) => [scalar(entry.name), valueText(entry.value)] as const)
      .filter((entry): entry is [string, PropertyValue] => entry[0] !== undefined && entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return [{
      kind: "component",
      componentName: scalar(component.componentName) ?? "(unnamed component)",
      ...(scalar(component.identifier) !== undefined ? { identifier: scalar(component.identifier) } : {}),
      properties: Object.fromEntries(properties),
      facetRefs: [],
    } satisfies ComponentItem];
  }

  const field = objectAt(instance.fieldInstance);
  if (field) {
    const attributes = Object.fromEntries(
      Object.entries(field)
        .filter(([key]) => key !== "fieldItem" && key !== "identifier")
        .map(([key, raw]) => [key, valueText(raw)])
        .filter((entry): entry is [string, PropertyValue] => entry[1] !== undefined),
    );
    const identifier = scalar(field.identifier);
    return [{
      kind: "field",
      fieldItem: scalar(field.fieldItem) ?? "(unnamed field)",
      ...(identifier !== undefined ? { identifier } : {}),
      attributes,
    } satisfies FieldItem];
  }
  return [];
}

function canonicalize(model: PageModel): PageModel {
  const rawRegions = model.regions;
  const facets = new Map(rawRegions.filter((region) => region.type === "Facet").map((region) => [region.name, region]));
  const canonicalNames = new Map<string, string>();
  const usedNames = new Set(rawRegions.filter((region) => region.type === "Region").map((region) => region.name));

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
    usedNames.add(name);
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
            usedNames.add(childPath);
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

function arrayAt(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objectAt(value: unknown): Record<string, unknown> | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first && typeof first === "object" && !Array.isArray(first) ? first as Record<string, unknown> : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return objectAt(value) ?? {};
}

function scalar(value: unknown): string | undefined {
  if (Array.isArray(value)) return scalar(value[0]);
  if (value === undefined || value === null || typeof value === "object") return undefined;
  return String(value);
}

function valueText(value: unknown, preserveList = false): PropertyValue | undefined {
  const direct = scalar(value);
  if (direct !== undefined) return direct;
  if (Array.isArray(value)) {
    const values = value.map((entry) => valueText(entry)).filter((entry): entry is PropertyValue => entry !== undefined);
    if (values.length === 0) return undefined;
    if (preserveList) return values;
    return mergeNamedValues(values) ?? (values.length === 1 ? values[0] : values);
  }
  const object = objectAt(value);
  if (!object) return undefined;
  const entries = Object.entries(object).sort(([left], [right]) => left.localeCompare(right));
  const name = scalar(object.name);
  if (name !== undefined && Object.prototype.hasOwnProperty.call(object, "value")) {
    const nested = valueText(object.value);
    return { [name]: nested ?? "" };
  }
  return Object.fromEntries(entries
    .map(([key, child]) => [key, valueText(child, ALWAYS_LIST_KEYS.has(key))] as const)
    .filter((entry): entry is [string, PropertyValue] => entry[1] !== undefined));
}

function mergeNamedValues(values: PropertyValue[]): PropertyValue | undefined {
  if (values.length === 0 || !values.every(isSingleEntryObject)) return undefined;
  const entries = values.flatMap((value) => Object.entries(value));
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return undefined;
  return Object.fromEntries(entries);
}

function isSingleEntryObject(value: PropertyValue): value is { [key: string]: PropertyValue } {
  return !Array.isArray(value) && typeof value === "object" && Object.keys(value).length === 1;
}

function componentLabel(item: ComponentItem): string {
  const identity = item.identifier ? `${item.componentName}#${item.identifier}` : item.componentName;
  const label = ["title", "label", "name"]
    .map((key) => item.properties[key])
    .find((value): value is string => typeof value === "string" && value.length > 0);
  return label && label !== item.componentName ? `${identity} (${label})` : identity;
}
