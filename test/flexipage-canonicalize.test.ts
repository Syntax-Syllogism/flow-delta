import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canonicalizePageModel } from "../src/flexipage/canonicalize-page.ts";
import type { ComponentItem, FieldItem, PageModel, PropertyValue, Region } from "../src/flexipage/page-model.ts";

const guid = (hex: string) => `Facet-${hex.repeat(36).slice(0, 36)}`;

function component(componentName: string, properties: Record<string, PropertyValue> = {}, identifier?: string): ComponentItem {
  return {
    kind: "component",
    componentName,
    ...(identifier ? { identifier } : {}),
    properties,
    facetRefs: [],
  };
}

function field(fieldItem: string, identifier?: string): FieldItem {
  return {
    kind: "field",
    fieldItem,
    ...(identifier ? { identifier } : {}),
    attributes: {},
  };
}

function region(name: string, type: Region["type"], items: Region["items"] = []): Region {
  return { name, type, items };
}

function model(regions: Region[]): PageModel {
  return { pageName: "Example", header: {}, regions };
}

test("canonicalizes transitive facet references without GUIDs", () => {
  const tabs = guid("1");
  const accordion = guid("2");
  const result = canonicalizePageModel(model([
    region("main", "Region", [component("flexipage:tab", { title: "Details", body: tabs }, "detailsTab")]),
    region(tabs, "Facet", [component("flexipage:accordion", { body: accordion }, "accountAccordion")]),
    region(accordion, "Facet", [field("Record.Name", "name")]),
  ]));

  assert.deepEqual(result.regions.map(({ name }) => name), [
    "main",
    "main › flexipage:tab#detailsTab (Details) › body",
    "main › flexipage:tab#detailsTab (Details) › body › flexipage:accordion#accountAccordion › body",
  ]);
  assert.ok(result.regions.every(({ name }) => !name.startsWith("Facet-")));
});

test("disambiguates duplicate sibling facet signals with deterministic suffixes", () => {
  const first = guid("1");
  const second = guid("2");
  const result = canonicalizePageModel(model([
    region("main", "Region", [component("container", { body: [first, second] })]),
    region(first, "Facet", [field("Record.First")]),
    region(second, "Facet", [field("Record.Second")]),
  ]));

  const names = result.regions.map(({ name }) => name);
  assert.deepEqual(names.slice(1), ["main › container › body", "main › container › body#2"]);
  assert.deepEqual(result.regions[0].items[0], {
    kind: "component",
    componentName: "container",
    properties: { body: [names[1], names[2]] },
    facetRefs: names.slice(1),
  });
});

test("terminates safely for cyclic facet references", () => {
  const first = guid("1");
  const second = guid("2");
  const result = canonicalizePageModel(model([
    region("main", "Region", [component("root", { body: first })]),
    region(first, "Facet", [component("first", { body: second })]),
    region(second, "Facet", [component("second", { body: first })]),
  ]));

  assert.deepEqual(result.regions.map(({ name }) => name), [
    "main",
    "main › root › body",
    "main › root › body › first › body",
  ]);
  assert.deepEqual(result.regions[2].items[0], {
    kind: "component",
    componentName: "second",
    properties: { body: "main › root › body" },
    facetRefs: ["main › root › body"],
  });
});

test("uses deterministic content hashes for orphan facets", () => {
  const first = canonicalizePageModel(model([region(guid("1"), "Facet", [component("force:detailPanel", { a: "1", z: "2" })])]));
  const second = canonicalizePageModel(model([region(guid("2"), "Facet", [component("force:detailPanel", { a: "1", z: "2" })])]));

  assert.match(first.regions[0].name, /^Facet:orphan:[0-9a-f]{12}$/);
  assert.equal(first.regions[0].name, second.regions[0].name);
});

test("rewrites nested property facet references and deduplicates facetRefs", () => {
  const facet = guid("1");
  const result = canonicalizePageModel(model([
    region("main", "Region", [component("container", { config: { slot: facet }, slots: [facet, facet] })]),
    region(facet, "Facet", [field("Record.Name")]),
  ]));
  const canonical = "main › container › config";
  const item = result.regions[0].items[0];

  if (item.kind !== "component") throw new Error("expected a component item");
  assert.deepEqual(item.properties, { config: { slot: canonical }, slots: [canonical, canonical] });
  assert.deepEqual(item.facetRefs, [canonical]);
});

test("rejects duplicate canonical region names", () => {
  assert.throws(
    () => canonicalizePageModel(model([region("main", "Region"), region("main", "Region")])),
    /FlexiPage canonicalization produced duplicate region names/,
  );
});

test("does not mutate the input model", () => {
  const facet = guid("1");
  const input = model([
    region("main", "Region", [component("container", { body: facet })]),
    region(facet, "Facet", [field("Record.Name")]),
  ]);
  const before = structuredClone(input);

  const result = canonicalizePageModel(input);

  assert.deepEqual(input, before);
  assert.notStrictEqual(result, input);
  assert.notStrictEqual(result.regions, input.regions);
});
