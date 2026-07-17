import { Parser } from "xml2js";
import { createHash } from "node:crypto";
import type { ComponentItem, FieldItem, Item, PageHeader, PageModel, Region } from "./page-model.ts";

const FACET_GUID = /^Facet-[0-9a-f-]{36}$/i;
const HEADER_KEYS = ["masterLabel", "type", "sobjectType", "parentFlexiPage", "description"] as const;

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
      .filter((entry): entry is [string, string] => entry[0] !== undefined && entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return [{
      kind: "component",
      componentName: scalar(component.componentName) ?? "(unnamed component)",
      properties: Object.fromEntries(properties),
      facetRefs: [],
    } satisfies ComponentItem];
  }

  const field = objectAt(instance.fieldInstance);
  if (field) {
    const attributes = Object.fromEntries(
      Object.entries(field)
        .filter(([key]) => key !== "fieldItem")
        .map(([key, raw]) => [key, valueText(raw)])
        .filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    return [{
      kind: "field",
      fieldItem: scalar(field.fieldItem) ?? "(unnamed field)",
      attributes,
    } satisfies FieldItem];
  }
  return [];
}

function canonicalize(model: PageModel): PageModel {
  const rawRegions = model.regions;
  const facets = new Map(rawRegions.filter((region) => region.type === "Facet").map((region) => [region.name, region]));
  const references = new Map<string, string[]>();

  for (const region of rawRegions) {
    region.items.forEach((item) => {
      if (item.kind !== "component") return;
      for (const [property, value] of Object.entries(item.properties)) {
        if (!facets.has(value)) continue;
        const context = `${region.name}:${item.componentName}:${property}`;
        references.set(value, [...(references.get(value) ?? []), context]);
      }
    });
  }

  const canonicalNames = new Map<string, string>();
  for (const [name, contexts] of references) {
    if (!FACET_GUID.test(name)) continue;
    const context = [...contexts].sort()[0];
    canonicalNames.set(name, `Facet:${context}`);
  }
  for (const facet of rawRegions.filter((region) => region.type === "Facet" && FACET_GUID.test(region.name))) {
    if (!canonicalNames.has(facet.name)) {
      canonicalNames.set(facet.name, `Facet:orphan:${facetHash(facet)}`);
    }
  }

  const regions = rawRegions.map((region) => ({
    ...region,
    name: canonicalNames.get(region.name) ?? region.name,
    items: region.items.map((item) => {
      if (item.kind !== "component") return item;
      const properties = Object.fromEntries(Object.entries(item.properties).map(([key, value]) => [key, canonicalNames.get(value) ?? value]));
      return {
        ...item,
        properties,
        facetRefs: Object.values(properties).filter((value) => rawRegions.some((candidate) => candidate.type === "Facet" && (canonicalNames.get(candidate.name) ?? candidate.name) === value)),
      } satisfies ComponentItem;
    }),
  }));

  return { ...model, regions };
}

function facetHash(region: Region): string {
  const stable = {
    type: region.type,
    mode: region.mode,
    items: region.items.map((item) => item.kind === "component"
      ? { kind: item.kind, componentName: item.componentName, properties: item.properties }
      : { kind: item.kind, fieldItem: item.fieldItem, attributes: item.attributes }),
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

function valueText(value: unknown): string | undefined {
  const direct = scalar(value);
  if (direct !== undefined) return direct;
  const object = objectAt(value);
  if (!object) return undefined;
  const entries = Object.entries(object).sort(([left], [right]) => left.localeCompare(right));
  return entries.map(([key, child]) => `${key}=${valueText(child) ?? ""}`).join(";");
}
