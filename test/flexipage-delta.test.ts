import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type { Element, HTMLButtonElement, HTMLElement } from "happy-dom";
import { buildFlexiPageComment, isZeroPageSummary } from "../src/ci/report-core.ts";
import { diffPage, type PageDiff } from "../src/flexipage/diff-page.ts";
import { parseFlexiPage } from "../src/flexipage/parse.ts";
import { renderOutline } from "../src/flexipage/render-outline.ts";
import { renderWireframe } from "../src/flexipage/render-wireframe.ts";
import { TEMPLATE_GEOMETRY, getTemplateGeometry, type TemplateGeometry } from "../src/flexipage/template-geometry.ts";
import { main as flexiPageCliMain } from "../src/flexipage-cli.ts";
import { VIEW_STORAGE_KEY, THEME_STORAGE_KEY } from "../src/render/shell.ts";
import { renderDom } from "./dom-harness.ts";

const page = (body: string, template = "recordHomeTemplateDesktop") => `<FlexiPage><masterLabel>Contact Record Page</masterLabel><type>RecordPage</type><sobjectType>Contact</sobjectType><template><name>${template}</name></template>${body}</FlexiPage>`;
const region = (name: string, type: string, items: string, mode = "Replace") => `<flexiPageRegions><name>${name}</name><type>${type}</type><mode>${mode}</mode>${items}</flexiPageRegions>`;
const component = (name: string, properties = "") => `<itemInstances><componentInstance><componentName>${name}</componentName>${properties}</componentInstance></itemInstances>`;
const componentWithIdentifier = (name: string, identifier: string, properties = "") => `<itemInstances><componentInstance><componentName>${name}</componentName><identifier>${identifier}</identifier>${properties}</componentInstance></itemInstances>`;
const field = (fieldItem: string, identifier: string, properties = "") => `<itemInstances><fieldInstance><fieldItem>${fieldItem}</fieldItem><identifier>${identifier}</identifier>${properties}</fieldInstance></itemInstances>`;
const property = (name: string, value: string) => `<componentInstanceProperties><name>${name}</name><value>${value}</value></componentInstanceProperties>`;
const fieldProperty = (name: string, value: string) => `<fieldInstanceProperties><name>${name}</name><value>${value}</value></fieldInstanceProperties>`;
const visibilityRule = (rightValue: string) => `<visibilityRule><criteria><leftValue>Record.Name</leftValue><operator>CONTAINS</operator><rightValue>${rightValue}</rightValue></criteria><booleanFilter>1</booleanFilter></visibilityRule>`;

function nestedPage(firstColumnField: string, firstColumnProperties: string, secondColumnField = "Record.Rating", secondColumnProperties = ""): string {
  const tabs = "Facet-11111111-1111-1111-1111-111111111111";
  const accordion = "Facet-22222222-2222-2222-2222-222222222222";
  const section = "Facet-33333333-3333-3333-3333-333333333333";
  const fieldSection = "Facet-44444444-4444-4444-4444-444444444444";
  const columns = "Facet-55555555-5555-5555-5555-555555555555";
  const firstColumn = "Facet-66666666-6666-6666-6666-666666666666";
  const secondColumn = "Facet-77777777-7777-7777-7777-777777777777";
  return page(
    region("main", "Region", componentWithIdentifier("flexipage:tabset", "tabset", property("label", "Tabs") + property("tabs", tabs)))
      + region(tabs, "Facet", componentWithIdentifier("flexipage:tab", "detailsTab", property("title", "Details") + property("body", accordion)))
      + region(accordion, "Facet", componentWithIdentifier("flexipage:accordion", "accountAccordion", property("sections", section)))
      + region(section, "Facet", componentWithIdentifier("flexipage:accordionSection", "accountSection", property("label", "Account Information") + property("body", fieldSection)))
      + region(fieldSection, "Facet", componentWithIdentifier("flexipage:fieldSection", "accountFields", property("columns", columns)))
      + region(columns, "Facet", componentWithIdentifier("flexipage:column", "column1", property("body", firstColumn)) + componentWithIdentifier("flexipage:column", "column2", property("body", secondColumn)))
      + region(firstColumn, "Facet", field(firstColumnField, "firstField", firstColumnProperties))
      + region(secondColumn, "Facet", field(secondColumnField, "secondField", secondColumnProperties)),
  );
}

test("FlexiPage no-op save canonicalizes GUID facets, property order, and region order", async () => {
  const oldXml = page(
    region("main", "Region", component("flexipage:tab", property("body", "Facet-11111111-1111-1111-1111-111111111111") + property("label", "Details")))
      + region("Facet-11111111-1111-1111-1111-111111111111", "Facet", component("force:detailPanel", property("z", "2") + property("a", "1")))
      + region("header", "Region", component("force:highlightsPanel", property("numVisibleActions", "3"))),
  );
  const newXml = page(
    region("header", "Region", component("force:highlightsPanel", property("numVisibleActions", "3")))
      + region("Facet-22222222-2222-2222-2222-222222222222", "Facet", component("force:detailPanel", property("a", "1") + property("z", "2")))
      + region("main", "Region", component("flexipage:tab", property("label", "Details") + property("body", "Facet-22222222-2222-2222-2222-222222222222"))),
  );
  const diff = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml));
  assert.equal(diff.summary.addedComponents, 0);
  assert.equal(diff.summary.removedComponents, 0);
  assert.equal(diff.summary.modifiedComponents, 0);
  assert.equal(diff.summary.addedRegions, 0);
  assert.equal(diff.summary.removedRegions, 0);
  assert.equal(diff.summary.changedPageAttributes, 0);
});

test("LCS reports an inserted component without modifying later components", async () => {
  const oldXml = page(region("main", "Region", component("A") + component("B") + component("C")));
  const newXml = page(region("main", "Region", component("A") + component("X") + component("B") + component("C")));
  const diff = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml));
  assert.equal(diff.summary.addedComponents, 1);
  assert.equal(diff.summary.modifiedComponents, 0);
  assert.deepEqual(diff.regions[0].items.map((item) => [item.componentName, item.status]), [["A", "unchanged"], ["X", "added"], ["B", "unchanged"], ["C", "unchanged"]]);
});

test("component properties and root scalars produce semantic deltas", async () => {
  const oldXml = page(region("main", "Region", component("force:detailPanel", property("numVisibleActions", "3"))));
  const newXml = page(region("main", "Region", component("force:detailPanel", property("numVisibleActions", "5"))), "recordHomeWithSubheaderTemplateDesktop");
  const diff = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml));
  assert.equal(diff.summary.modifiedComponents, 1);
  assert.deepEqual(diff.regions[0].items[0].changes, [{ path: "numVisibleActions", before: "3", after: "5" }]);
  assert.deepEqual(diff.pageChanges, [{ path: "template", before: "recordHomeTemplateDesktop", after: "recordHomeWithSubheaderTemplateDesktop" }]);
  assert.equal(diff.summary.changedPageAttributes, 1);
});

test("outline is offline, filterable, and nested", async () => {
  const oldXml = page(
    region("main", "Region", component("flexipage:tab", property("body", "Facet-11111111-1111-1111-1111-111111111111")))
      + region("Facet-11111111-1111-1111-1111-111111111111", "Facet", component("force:detailPanel")),
  );
  const newXml = page(
    region("main", "Region", component("flexipage:tab", property("body", "Facet-22222222-2222-2222-2222-222222222222")))
      + region("Facet-22222222-2222-2222-2222-222222222222", "Facet", component("force:detailPanel")),
    "newTemplate",
  );
  const diff = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml));
  const html = renderOutline(diff);
  assert.match(html, /force:detailPanel/);
  assert.match(html, /data-view-mode="changes"/);
  assert.match(html, /data-theme-choice="dark"/);
  assert.match(html, /panel-resizer/);
  assert.match(html, /Template changed/);
  assert.doesNotMatch(html, /Next steps: reorder detection and richer per-component detail/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("wireframe renders registry placement, status rows, and defaults to wireframe", async () => {
  const oldXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main")) + region("sidebar", "Region", component("Sidebar")));
  const newXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main") + component("Added")) + region("sidebar", "Region", component("Sidebar")));
  const html = renderOutline(diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml)), { template: "recordHomeTemplateDesktop" });
  assert.match(html, /class="view-button" data-view-mode="wireframe"/);
  assert.match(html, /data-slot="header"/);
  assert.match(html, /grid-template-columns:67fr 33fr/);
  assert.match(html, /data-status="added"[^>]*data-item-id="main:after:1"/);
  assert.match(html, /Template geometry: Header and Right Sidebar/);
  assert.match(html, /data-view-canvas="outline"/);
  assert.match(html, /data-view-canvas="wireframe"/);
  assert.match(html, /<div class="display-controls"><div class="view-toggle"[\s\S]*<div class="theme-toggle"/);
  assert.match(html, /\.wireframe-rollup \{[^}]*border:1px solid var\(--modified\)[^}]*background:var\(--modified-fill\)[^}]*color:var\(--modified\)/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.ok(TEMPLATE_GEOMETRY["flexipage:recordHomeTemplateDesktop"]);
  assert.ok(Object.isFrozen(TEMPLATE_GEOMETRY));
  assert.ok(Object.isFrozen(TEMPLATE_GEOMETRY["flexipage:recordHomeTemplateDesktop"]));
});

test("the default view is resolved in the head, so the outline never flashes first", async () => {
  const body = region("header", "Region", component("Header")) + region("main", "Region", component("Main")) + region("sidebar", "Region", component("Sidebar"));
  const withWireframe = renderOutline(diffPage(await parseFlexiPage(page(body)), await parseFlexiPage(page(body))), { template: "recordHomeTemplateDesktop" });

  // The view has to be settled before either canvas is parsed. If it were left to the
  // end-of-body script, the browser would paint the outline and swap it a frame later.
  const head = withWireframe.slice(0, withWireframe.indexOf("<body>"));
  assert.match(head, new RegExp(JSON.stringify(VIEW_STORAGE_KEY)), "head must read the stored view preference");
  assert.match(head, /documentElement\.dataset\.view/, "head must stamp the view before first paint");
  assert.match(head, /"wireframe"/, "head must know the default view");

  // Visibility is CSS keyed on that stamp. A `hidden` attribute would need JS to undo it,
  // which is the flash we are avoiding.
  assert.doesNotMatch(withWireframe, /<div class="view-canvas"[^>]*hidden/);
  assert.match(withWireframe, /:root\[data-view="wireframe"\]\s*\[data-view-canvas="outline"\]\s*\{\s*display:none/);

  // No wireframe: nothing to resolve, so no head script and no stray view attribute.
  const outlineOnly = renderOutline(diffPage(await parseFlexiPage(page(body)), await parseFlexiPage(page(body))), { template: "custom:unknown" });
  assert.doesNotMatch(outlineOnly.slice(0, outlineOnly.indexOf("<body>")), /dataset\.view/);
});

test("FlexiPage filters execute in both canvases and keep wireframe cells for context", async () => {
  // Deliberately excluded from this harness: the pointer resizer depends on
  // layout geometry, which happy-dom does not compute.
  const oldXml = page(
    region("header", "Region", component("Header"))
      + region("main", "Region", component("Main"))
      + region("sidebar", "Region", component("Sidebar")),
  );
  const newXml = page(
    region("header", "Region", component("Header"))
      + region("main", "Region", component("Main") + component("Added")),
  );
  const html = renderOutline(diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml)), { template: "recordHomeTemplateDesktop" });
  const dom = await renderDom(html);
  try {
    const filters = Array.from(dom.document.querySelectorAll(".filters button")) as HTMLButtonElement[];
    assert.equal(dom.document.documentElement.dataset.view, "wireframe");
    assert.equal(filters.length, 4);

    const rows = (canvas: Element) => Array.from(canvas.querySelectorAll(".outline-row")) as HTMLElement[];
    const canvases = Array.from(dom.document.querySelectorAll("[data-view-canvas]")) as HTMLElement[];
    assert.equal(canvases.length, 2);

    for (const mode of ["all", "after", "before", "changes"]) {
      filters.find((button) => button.dataset.viewMode === mode)?.click();
      for (const button of filters) assert.equal(button.classList.contains("active"), button.dataset.viewMode === mode);
      for (const canvas of canvases) {
        const canvasRows = rows(canvas);
        assert.ok(canvasRows.length > 0, `${canvas.dataset.viewCanvas} has rows`);
        assert.equal(canvasRows.filter((row) => row.dataset.status === "added").every((row) => row.hidden), mode === "before");
        assert.equal(canvasRows.filter((row) => row.dataset.status === "deleted").every((row) => row.hidden), mode === "after");
        assert.equal(canvasRows.filter((row) => row.dataset.status === "unchanged").every((row) => row.hidden), mode === "changes");
      }
    }

    filters.find((button) => button.dataset.viewMode === "changes")?.click();
    const wireframeHeader = dom.document.querySelector('[data-view-canvas="wireframe"] [data-slot="header"]') as HTMLElement | null;
    assert.ok(wireframeHeader);
    assert.equal(wireframeHeader.hidden, false, "changes-only keeps the unchanged wireframe cell for spatial context");
    assert.equal((wireframeHeader.querySelector(".outline-row") as HTMLElement | null)?.hidden, true, "changes-only hides unchanged rows inside that cell");
  } finally {
    dom.close();
  }
});

test("FlexiPage view and theme preferences execute, persist, and reject poisoned storage", async () => {
  const xml = page(
    region("header", "Region", component("Header"))
      + region("main", "Region", component("Main"))
      + region("sidebar", "Region", component("Sidebar")),
  );
  const html = renderOutline(diffPage(await parseFlexiPage(xml), await parseFlexiPage(xml)), { template: "recordHomeTemplateDesktop" });

  const seeded = await renderDom(html, { [VIEW_STORAGE_KEY]: "outline", [THEME_STORAGE_KEY]: "dark" });
  try {
    assert.equal(seeded.document.documentElement.dataset.view, "outline");
    assert.equal(seeded.document.documentElement.dataset.theme, "dark");
    assert.equal((seeded.document.querySelector('[data-view-mode="outline"]') as HTMLButtonElement | null)?.classList.contains("active"), true);
    assert.equal((seeded.document.querySelector('[data-theme-choice="dark"]') as HTMLButtonElement | null)?.getAttribute("aria-pressed"), "true");

    (seeded.document.querySelector('[data-view-mode="wireframe"]') as HTMLButtonElement | null)?.click();
    assert.equal(seeded.document.documentElement.dataset.view, "wireframe");
    assert.equal(seeded.window.localStorage.getItem(VIEW_STORAGE_KEY), "wireframe");
    (seeded.document.querySelector('[data-theme-choice="light"]') as HTMLButtonElement | null)?.click();
    assert.equal(seeded.document.documentElement.dataset.theme, "light");
    assert.equal(seeded.window.localStorage.getItem(THEME_STORAGE_KEY), "light");
  } finally {
    seeded.close();
  }

  const poisoned = await renderDom(html, { [VIEW_STORAGE_KEY]: "sideways", [THEME_STORAGE_KEY]: "purple" });
  try {
    assert.equal(poisoned.document.documentElement.dataset.view, "wireframe");
    assert.equal(poisoned.document.documentElement.dataset.theme, "system");
  } finally {
    poisoned.close();
  }
});

test("FlexiPage row selection populates details for click and keyboard activation", async () => {
  const oldXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main")));
  const newXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main") + component("Added")));
  const html = renderOutline(diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml)), { template: "recordHomeTemplateDesktop" });
  const dom = await renderDom(html);
  try {
    const added = dom.document.querySelector('[data-item-id="main:after:1"]') as HTMLElement | null;
    assert.ok(added, "expected added row");
    added.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(dom.document.getElementById("panel-title")?.textContent, "Added");
    assert.equal(dom.document.getElementById("panel-badge")?.textContent, "added");
    assert.match(dom.document.getElementById("panel-body")?.innerHTML ?? "", /No property details available\./);

    const unchanged = dom.document.querySelector('[data-status="unchanged"][data-item-id^="header:"]') as HTMLElement | null;
    assert.ok(unchanged, "expected unchanged header row");
    unchanged.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
    assert.equal(dom.document.getElementById("panel-title")?.textContent, "Header");
    assert.equal(dom.document.getElementById("panel-body")?.textContent, "No property changes.");
  } finally {
    dom.close();
  }
});

test("wireframe places nested stack families with their inner widths", async () => {
  const appXml = page(region("region1", "Region", component("One")) + region("region2", "Region", component("Two")) + region("region3", "Region", component("Three")), "flexipage:appHomeTemplateTwoColumnsStacked");
  const appDiff = diffPage(await parseFlexiPage(appXml), await parseFlexiPage(appXml));
  const appHtml = renderWireframe(appDiff, TEMPLATE_GEOMETRY["flexipage:appHomeTemplateTwoColumnsStacked"]);
  assert.match(appHtml!, /wireframe-stack/);
  assert.match(appHtml!, /grid-template-columns:67fr 33fr/);
  assert.equal(countOccurrences(appHtml!, 'data-slot="region2"'), 1);

  const homeXml = page(region("top", "Region", component("Top")) + region("bottomLeft", "Region", component("Left")) + region("bottomRight", "Region", component("Right")) + region("sidebar", "Region", component("Sidebar")), "home:desktopTemplate");
  const homeDiff = diffPage(await parseFlexiPage(homeXml), await parseFlexiPage(homeXml));
  const homeHtml = renderWireframe(homeDiff, TEMPLATE_GEOMETRY["home:desktopTemplate"]);
  assert.match(homeHtml!, /wireframe-stack-row/);
  assert.match(homeHtml!, /grid-template-columns:50fr 50fr/);
  assert.equal(countOccurrences(homeHtml!, 'data-slot="bottomLeft"'), 1);
});

test("wireframe covers every registered template's slots", async () => {
  for (const [template, geometry] of Object.entries(TEMPLATE_GEOMETRY)) {
    const slots = geometrySlots(geometry);
    const xml = page(slots.map((slot) => region(slot, "Region", component(slot))).join(""), template);
    const diff = diffPage(await parseFlexiPage(xml), await parseFlexiPage(xml));
    const html = renderWireframe(diff, geometry);
    assert.ok(html, template);
    for (const slot of slots) assert.match(html!, new RegExp(`data-slot="${slot}"`), template);
  }
});

test("real org fixtures render a wireframe for every template they cover", async () => {
  const root = join(process.cwd(), "fixtures", "flexipage-template");
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    const before = await parseFlexiPage(readFileSync(join(dir, "before.flexipage-meta.xml"), "utf8"));
    const after = await parseFlexiPage(readFileSync(join(dir, "after.flexipage-meta.xml"), "utf8"));
    const template = after.header.template;
    assert.ok(template, `${name}: after fixture declares no template`);
    assert.equal(before.header.template, template, `${name}: before/after disagree on the template`);
    const geometry = getTemplateGeometry(template);
    assert.ok(geometry, `${name}: ${template} is not in the geometry registry`);
    const diff = diffPage(before, after);
    const html = renderWireframe(diff, geometry);
    assert.ok(html, `${name}: fell back to the outline instead of rendering a wireframe`);
    for (const slot of geometrySlots(geometry!)) assert.match(html!, new RegExp(`data-slot="${slot}"`), `${name}: slot ${slot} is missing`);
    assert.equal(isZeroPageSummary(diff.summary), false, `${name}: the pair has no changes to review`);
  }
});

test("unknown templates and slot mismatches fall back to outline", async () => {
  const unknown = diffPage(await parseFlexiPage(page(region("main", "Region", component("A")))), await parseFlexiPage(page(region("main", "Region", component("A")))));
  assert.doesNotMatch(renderOutline(unknown, { template: "custom:template" }), /class="view-button"/);

  const mismatch = diffPage(await parseFlexiPage(page(region("unexpected", "Region", component("A")))), await parseFlexiPage(page(region("unexpected", "Region", component("A")))));
  assert.doesNotMatch(renderOutline(mismatch, { template: "recordHomeTemplateDesktop" }), /class="view-button"/);
});

test("wireframe keeps empty slots and appends removed regions after a template change", async () => {
  const empty = diffPage(await parseFlexiPage(page(region("header", "Region", component("Header")))), await parseFlexiPage(page(region("header", "Region", component("Header")))));
  const emptyHtml = renderOutline(empty, { template: "recordHomeTemplateDesktop" });
  assert.match(emptyHtml, /data-slot="sidebar"/);
  assert.match(emptyHtml, /Empty slot/);

  const oldXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main")) + region("sidebar", "Region", component("RemovedSidebar")), "recordHomeTemplateDesktop");
  const newXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main")), "recordHomeSingleColTemplateDesktop");
  const html = renderOutline(diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml)), { template: "recordHomeSingleColTemplateDesktop" });
  assert.match(html, /class="view-button" data-view-mode="wireframe"/);
  assert.match(html, /Template changed/);
  assert.match(html, /Removed \(not in current template\)/);
  assert.match(html, /RemovedSidebar/);
});

test("wireframe does not duplicate deleted regions whose slots remain available", async () => {
  const oldXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main")) + region("sidebar", "Region", component("RemovedSidebar")));
  const newXml = page(region("header", "Region", component("Header")) + region("main", "Region", component("Main")));
  const html = renderOutline(diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml)), { template: "recordHomeTemplateDesktop" });
  // Anchor on the canvas element itself: the bare attribute string also appears in the
  // stylesheet, and slicing from there would swallow the outline canvas too.
  const wireframe = html.slice(html.indexOf('<div class="view-canvas" data-view-canvas="wireframe">'));
  assert.equal(countOccurrences(wireframe, 'data-item-id="sidebar:before:0"'), 1);
  assert.doesNotMatch(wireframe, /Removed \(not in current template\)/);
  assert.match(wireframe, /data-slot="sidebar"/);
});

test("wireframe nests facet content and keeps orphan facet status honest", async () => {
  const facetId = "Facet-11111111-1111-1111-1111-111111111111";
  const xml = page(region("header", "Region", component("Header")) + region("main", "Region", component("flexipage:tab", property("body", facetId))) + region(facetId, "Facet", component("force:detailPanel")) + region("Orphan", "Facet", component("force:utilityBar")));
  const html = renderOutline(diffPage(await parseFlexiPage(xml), await parseFlexiPage(xml)), { template: "recordHomeTemplateDesktop" });
  assert.match(html, /class="facet-region"/);
  assert.match(html, /force:detailPanel/);
  assert.match(html, /Unplaced facet regions/);
  assert.match(html, /data-region-status="unchanged"[^>]*>.*Orphan/s);
  assert.doesNotMatch(html, /Removed \(not in current template\).*Orphan/s);
});

test("FlexiPage reporter comments on a template-only change", () => {
  const summary = { addedComponents:0, removedComponents:0, modifiedComponents:0, addedRegions:0, removedRegions:0, modifiedRegions:0, changedPageAttributes:1 };
  assert.equal(isZeroPageSummary(summary), false);
  const comment = buildFlexiPageComment([{ pageName:"Contact Record Page", summary, pageChanges:[{ path:"template", before:"old", after:"new" }], artifactUrl:"artifact.html" }]);
  assert.match(comment, /Components \(\+\/–\/~\)/);
  assert.match(comment, /Page Attributes \(\+\/-\/~\)/);
  assert.match(comment, /Contact Record Page \| \+0 \/ −0 \/ ~0 \| \+0 \/ −0 \/ ~0 \| \+0 \/ −0 \/ ~1 \| \[View\]\(artifact\.html\) \|/);
});

test("FlexiPage CLI file mode writes an offline HTML and JSON artifact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "flexipage-delta-test-"));
  const out = join(dir, "out");
  const oldPath = join(dir, "before.flexipage-meta.xml");
  const newPath = join(dir, "after.flexipage-meta.xml");
  writeFileSync(oldPath, page(region("main", "Region", component("A"))), "utf8");
  writeFileSync(newPath, page(region("main", "Region", component("A") + component("B"))), "utf8");
  await flexiPageCliMain(["--old", oldPath, "--new", newPath, "--out", out, "--json"]);
  const files = readdirSync(out);
  assert.equal(files.filter((file) => file.endsWith(".html")).length, 1);
  assert.equal(files.filter((file) => file.endsWith(".diff.json")).length, 1);
});

test("on-disk FlexiPage fixtures stay covered by semantic summaries", async () => {
  const expected: Record<string, Record<string, number>> = {
    noop_save: { addedComponents:0, removedComponents:0, modifiedComponents:0, addedRegions:0, removedRegions:0, modifiedRegions:0, changedPageAttributes:0 },
    insert_component_top: { addedComponents:1, removedComponents:0, modifiedComponents:0, addedRegions:0, removedRegions:0, modifiedRegions:0, changedPageAttributes:0 },
    change_template: { addedComponents:0, removedComponents:0, modifiedComponents:0, addedRegions:0, removedRegions:0, modifiedRegions:0, changedPageAttributes:1 },
    add_component: { addedComponents:1, removedComponents:0, modifiedComponents:0, addedRegions:0, removedRegions:0, modifiedRegions:0, changedPageAttributes:0 },
    modify_component_property: { addedComponents:0, removedComponents:0, modifiedComponents:1, addedRegions:0, removedRegions:0, modifiedRegions:0, changedPageAttributes:0 },
  };
  for (const name of readdirSync(join(process.cwd(), "fixtures", "flexipage-diff"))) {
    const dir = join(process.cwd(), "fixtures", "flexipage-diff", name);
    const diff = diffPage(
      await parseFlexiPage(readFileSync(join(dir, "before.flexipage-meta.xml"), "utf8")),
      await parseFlexiPage(readFileSync(join(dir, "after.flexipage-meta.xml"), "utf8")),
    );
    assert.deepEqual(diff.summary, { ...expected[name], unchangedComponents: diff.summary.unchangedComponents });
  }
});

test("LCS documents the v0.1 reorder limitation as delete plus add", async () => {
  const diff = diffPage(await parseFlexiPage(page(region("main", "Region", component("A") + component("B") + component("C")))), await parseFlexiPage(page(region("main", "Region", component("C") + component("A") + component("B")))));
  assert.equal(diff.summary.addedComponents, 1);
  assert.equal(diff.summary.removedComponents, 1);
  assert.equal(diff.summary.modifiedComponents, 0);
});

test("region additions/removals and mode changes are summarized", async () => {
  const oldXml = page(region("main", "Region", component("A")));
  const added = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(page(region("main", "Region", component("A")) + region("sidebar", "Region", component("B")))));
  assert.equal(added.summary.addedRegions, 1);
  const removed = diffPage(await parseFlexiPage(page(region("main", "Region", component("A")) + region("sidebar", "Region", component("B")))), await parseFlexiPage(oldXml));
  assert.equal(removed.summary.removedRegions, 1);
  const modeChanged = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(page(region("main", "Region", component("A"), "Append"))));
  assert.equal(modeChanged.summary.modifiedRegions, 1);
  assert.equal(isZeroPageSummary(modeChanged.summary), false);
});

test("whole-page add/delete skips root scalar diffs", async () => {
  const oldPage = await parseFlexiPage(page(region("main", "Region", component("A"))));
  const newPage = await parseFlexiPage(page(region("main", "Region", component("B"))));
  const added = diffPage({ pageName:"(unknown)", header:{}, regions:[] }, newPage);
  const deleted = diffPage(oldPage, { pageName:"(unknown)", header:{}, regions:[] });
  assert.equal(added.summary.addedRegions, 1);
  assert.equal(deleted.summary.removedRegions, 1);
  assert.equal(added.pageChanges, undefined);
  assert.equal(deleted.pageChanges, undefined);
});

test("parser covers app slots, field instances, and flow interview properties", async () => {
  const model = await parseFlexiPage(`<FlexiPage><masterLabel>Home</masterLabel><type>HomePage</type><flexiPageRegions><name>region1</name><type>Region</type><itemInstances><fieldInstance><fieldItem>Record.Name</fieldItem><identifier>name</identifier></fieldInstance></itemInstances></flexiPageRegions><flexiPageRegions><name>region2</name><type>Region</type><itemInstances><componentInstance><componentName>flowruntime:interview</componentName><componentInstanceProperties><name>flowName</name><value>MyFlow</value></componentInstanceProperties></componentInstance></itemInstances></flexiPageRegions></FlexiPage>`);
  assert.equal(model.header.type, "HomePage");
  assert.equal(model.regions[0].items[0].kind, "field");
  assert.equal(model.regions[1].items[0].kind, "component");
  assert.equal((model.regions[1].items[0] as { properties: Record<string,string> }).properties.flowName, "MyFlow");
});

test("nested facets resolve transitively with collision-free breadcrumbs and preserve identifiers", async () => {
  const oldModel = await parseFlexiPage(nestedPage("Record.Name", fieldProperty("uiBehavior", "required")));
  const newModel = await parseFlexiPage(nestedPage("Record.Name", fieldProperty("uiBehavior", "readonly")));
  assert.equal(oldModel.regions.length, new Set(oldModel.regions.map((region) => region.name)).size);
  assert.ok(oldModel.regions.every((region) => !/Facet-[0-9a-f-]{36}/i.test(region.name)));
  const tabset = oldModel.regions.find((region) => region.name === "main")?.items[0];
  assert.equal(tabset?.kind, "component");
  assert.equal(tabset?.identifier, "tabset");

  const diff = diffPage(oldModel, newModel);
  assert.equal(diff.summary.modifiedComponents, 1);
  const changed = diff.regions.flatMap((region) => region.items).find((item) => item.status === "modified");
  assert.ok(changed);
  assert.match(changed.path, /main.*Tabs.*Details.*accordion.*Account Information.*column1/);
  assert.doesNotMatch(changed.path, /Facet-[0-9a-f-]{36}/i);
  assert.deepEqual(changed.changes, [{ path: "fieldInstanceProperties.uiBehavior", before: "required", after: "readonly" }]);
});

test("nested facet GUID churn is a semantic no-op", async () => {
  const original = nestedPage("Record.Name", fieldProperty("uiBehavior", "required"));
  const churned = [
    ["11111111-1111-1111-1111-111111111111", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    ["22222222-2222-2222-2222-222222222222", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
    ["33333333-3333-3333-3333-333333333333", "cccccccc-cccc-cccc-cccc-cccccccccccc"],
    ["44444444-4444-4444-4444-444444444444", "dddddddd-dddd-dddd-dddd-dddddddddddd"],
    ["55555555-5555-5555-5555-555555555555", "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"],
    ["66666666-6666-6666-6666-666666666666", "ffffffff-ffff-ffff-ffff-ffffffffffff"],
    ["77777777-7777-7777-7777-777777777777", "99999999-9999-9999-9999-999999999999"],
  ].reduce((xml, [before, after]) => xml.replaceAll(`Facet-${before}`, `Facet-${after}`), original);
  assert.equal(isZeroPageSummary(diffPage(await parseFlexiPage(original), await parseFlexiPage(churned)).summary), true);
});

test("nested fixture locks add/remove placement in the former collision-loser column", async () => {
  const root = join(process.cwd(), "fixtures", "flexipage-template", "nestedDynamicForms");
  const diff = diffPage(
    await parseFlexiPage(readFileSync(join(root, "before.flexipage-meta.xml"), "utf8")),
    await parseFlexiPage(readFileSync(join(root, "after.flexipage-meta.xml"), "utf8")),
  );
  assert.equal(diff.summary.addedComponents, 2);
  assert.equal(diff.summary.removedComponents, 2);
  assert.equal(diff.summary.modifiedComponents, 1);
  const items = diff.regions.flatMap((region) => region.items);
  const accountNumber = items.find((item) => item.fieldItem === "Record.AccountNumber");
  assert.equal(accountNumber?.status, "deleted");
  assert.match(accountNumber?.path ?? "", /main.*column1/);
  assert.equal(items.find((item) => item.fieldItem === "Record.Sic")?.status, "deleted");
  assert.deepEqual(items.find((item) => item.fieldItem === "Record.Fax")?.changes, [{ path: "fieldInstanceProperties.uiBehavior", before: "none", after: "readonly" }]);
  assert.deepEqual(items.find((item) => item.fieldItem === "Record.ShippingAddress")?.notes, ["has visibility rule"]);
  assert.equal(items.find((item) => item.fieldItem === "Record.CleanStatus")?.status, "added");
});

test("wireframe rolls nested changes into an in-panel digest", async () => {
  const root = join(process.cwd(), "fixtures", "flexipage-template", "nestedDynamicForms");
  const diff = diffPage(
    await parseFlexiPage(readFileSync(join(root, "before.flexipage-meta.xml"), "utf8")),
    await parseFlexiPage(readFileSync(join(root, "after.flexipage-meta.xml"), "utf8")),
  );
  const dom = await renderDom(renderOutline(diff, { template: "recordHomeTemplateDesktop" }));
  try {
    const main = dom.document.querySelector('[data-view-canvas="wireframe"] [data-slot="main"]') as HTMLElement | null;
    assert.ok(main);
    assert.match(main.textContent ?? "", /5 changes/);
    assert.equal(dom.document.querySelector('[data-slot="header"] .wireframe-rollup'), null);
    assert.equal(dom.document.querySelector('[data-slot="sidebar"] .wireframe-rollup'), null);

    const tabset = main.querySelector('.outline-row') as HTMLElement | null;
    assert.ok(tabset);
    tabset.click();
    assert.equal(dom.document.getElementById("panel-title")?.textContent, "flexipage:tabset");

    (dom.document.getElementById("panel-toggle") as HTMLButtonElement | null)?.click();
    assert.equal(dom.document.body.classList.contains("panel-collapsed"), true);
    (main.querySelector(".wireframe-rollup") as HTMLButtonElement | null)?.click();
    assert.equal(dom.document.getElementById("panel-title")?.textContent, "main changes");
    assert.equal(dom.document.body.classList.contains("panel-collapsed"), false);
    assert.equal(dom.document.getElementById("panel-toggle")?.getAttribute("aria-expanded"), "true");
    assert.equal(dom.document.querySelectorAll(".digest-group").length, 1);
    assert.match(dom.document.querySelector(".digest-group-head")?.textContent ?? "", /Account Information/);
    assert.equal(dom.document.querySelectorAll(".digest-entry").length, 5);
    assert.ok(dom.document.querySelector(".digest-entry.deleted .status-badge"));
    assert.ok(dom.document.querySelector(".digest-entry.modified .status-badge"));
    assert.ok(dom.document.querySelector(".digest-entry.added .status-badge"));

    (dom.document.querySelector(".digest-entry") as HTMLButtonElement | null)?.click();
    assert.equal(dom.document.getElementById("panel-title")?.textContent, "Record.AccountNumber");
    assert.equal((dom.document.getElementById("panel-back") as HTMLButtonElement | null)?.hidden, false);
    assert.match(dom.document.getElementById("panel-body")?.textContent ?? "", /AccountNumber/);

    (dom.document.getElementById("panel-back") as HTMLButtonElement | null)?.click();
    assert.equal(dom.document.getElementById("panel-title")?.textContent, "main changes");
    assert.equal(dom.document.querySelectorAll(".digest-entry").length, 5);
  } finally {
    dom.close();
  }
});

test("wireframe rollup includes a region's own change with nested changes", async () => {
  const root = join(process.cwd(), "fixtures", "flexipage-template", "nestedDynamicForms");
  const before = readFileSync(join(root, "before.flexipage-meta.xml"), "utf8");
  const after = readFileSync(join(root, "after.flexipage-meta.xml"), "utf8").replace("<mode>Replace</mode>", "<mode>Append</mode>");
  const diff = diffPage(await parseFlexiPage(before), await parseFlexiPage(after));
  const dom = await renderDom(renderOutline(diff, { template: "recordHomeTemplateDesktop" }));
  try {
    const main = dom.document.querySelector('[data-view-canvas="wireframe"] [data-slot="main"]') as HTMLElement | null;
    assert.ok(main);
    assert.match(main.className, /modified/);
    assert.match(main.textContent ?? "", /6 changes/);
    (main.querySelector(".wireframe-rollup") as HTMLButtonElement | null)?.click();
    assert.equal(dom.document.querySelectorAll(".digest-entry").length, 6);
    assert.match(dom.document.querySelector(".digest-entry")?.textContent ?? "", /main/);
  } finally {
    dom.close();
  }
});

test("wireframe digest groups changes by labeled container", async () => {
  const item = (id: string, container: string, fieldItem: string): PageDiff["regions"][number]["items"][number] => ({
    id,
    path: `main › flexipage:accordionSection#${container} (${container}) › ${fieldItem}`,
    kind: "field",
    status: "modified",
    fieldItem,
    changes: [{ path: "fieldInstanceProperties.uiBehavior", before: "none", after: "readonly" }],
  });
  const diff: PageDiff = {
    pageName: "Contact Record Page",
    kind: "flexipage",
    summary: { addedComponents:0, removedComponents:0, modifiedComponents:2, unchangedComponents:0, addedRegions:0, removedRegions:0, modifiedRegions:0, changedPageAttributes:0 },
    regions: [
      { name: "main", path: "main", type: "Region", status: "unchanged", items: [] },
      { name: "account", path: "main › flexipage:accordionSection#account (Account Information)", type: "Facet", status: "modified", items: [item("account-field", "Account Information", "Record.Fax")] },
      { name: "additional", path: "main › flexipage:accordionSection#additional (Additional Information)", type: "Facet", status: "modified", items: [item("additional-field", "Additional Information", "Record.CleanStatus")] },
    ],
  };
  const dom = await renderDom(renderOutline(diff, { template: "recordHomeTemplateDesktop" }));
  try {
    const main = dom.document.querySelector('[data-view-canvas="wireframe"] [data-slot="main"]') as HTMLElement | null;
    assert.ok(main);
    assert.match(main.textContent ?? "", /2 changes/);
    (main.querySelector(".wireframe-rollup") as HTMLButtonElement | null)?.click();
    const groups = Array.from(dom.document.querySelectorAll(".digest-group-head"), (group) => group.textContent ?? "");
    assert.deepEqual(groups, ["Account Information1 change", "Additional Information1 change"]);
  } finally {
    dom.close();
  }
});

test("Dynamic Forms duplicate fields use identifier-aware identity", async () => {
  const oldXml = page(region("main", "Region", field("Record.Website", "RecordWebsiteField", fieldProperty("uiBehavior", "readonly")) + field("Record.Website", "RecordWebsiteField2", fieldProperty("uiBehavior", "required"))));
  const newXml = page(region("main", "Region", field("Record.Website", "RecordWebsiteField", fieldProperty("uiBehavior", "readonly")) + field("Record.Website", "RecordWebsiteField2", fieldProperty("uiBehavior", "none"))));
  const diff = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml));
  assert.equal(diff.summary.modifiedComponents, 1);
  assert.equal(diff.regions[0].items.filter((item) => item.status === "unchanged").length, 1);
  assert.equal(diff.regions[0].items.find((item) => item.status === "modified")?.identifier, "RecordWebsiteField2");
  assert.deepEqual(diff.regions[0].items.find((item) => item.status === "modified")?.changes, [{ path: "fieldInstanceProperties.uiBehavior", before: "required", after: "none" }]);
});

test("Dynamic Forms field properties merge by name regardless of sibling count or order", async () => {
  const oldXml = page(region("main", "Region", field("Record.Name", "name", fieldProperty("density", "comfy") + fieldProperty("uiBehavior", "required"))));
  const changedXml = page(region("main", "Region", field("Record.Name", "name", fieldProperty("density", "comfy") + fieldProperty("uiBehavior", "readonly"))));
  const insertedXml = page(region("main", "Region", field("Record.Name", "name", fieldProperty("density", "comfy") + fieldProperty("label", "Name") + fieldProperty("uiBehavior", "required"))));
  const changed = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(changedXml));
  assert.deepEqual(changed.regions[0].items[0].changes, [{ path: "fieldInstanceProperties.uiBehavior", before: "required", after: "readonly" }]);
  const inserted = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(insertedXml));
  assert.deepEqual(inserted.regions[0].items[0].changes, [{ path: "fieldInstanceProperties.label", before: undefined, after: "Name" }]);
});

test("visibility rules diff by criterion and are noted on added fields", async () => {
  const oldXml = page(region("main", "Region", field("Record.ShippingAddress", "shipping", visibilityRule("Ship"))));
  const changedXml = page(region("main", "Region", field("Record.ShippingAddress", "shipping", visibilityRule("Deliver"))));
  const changed = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(changedXml));
  assert.deepEqual(changed.regions[0].items[0].changes, [{ path: "visibilityRule.criteria[0].rightValue", before: "Ship", after: "Deliver" }]);

  const added = diffPage(await parseFlexiPage(page(region("main", "Region", ""))), await parseFlexiPage(oldXml));
  assert.deepEqual(added.regions[0].items[0].notes, ["has visibility rule"]);
  assert.match(renderOutline(added), /has visibility rule/);
});

test("unreferenced GUID facets canonicalize by content", async () => {
  const oldXml = page(region("Facet-11111111-1111-1111-1111-111111111111", "Facet", component("force:detailPanel")));
  const newXml = page(region("Facet-22222222-2222-2222-2222-222222222222", "Facet", component("force:detailPanel")));
  const diff = diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml));
  assert.equal(diff.summary.addedRegions, 0);
  assert.equal(diff.summary.removedRegions, 0);
});

test("CLI git mode matches file-mode diff output", async () => {
  const repo = mkdtempSync(join(tmpdir(), "flexipage-delta-git-"));
  const out = mkdtempSync(join(tmpdir(), "flexipage-delta-out-"));
  const relative = "force-app/main/default/flexipages/Contact.flexipage-meta.xml";
  const absolute = join(repo, relative);
  const oldXml = page(region("main", "Region", component("A")));
  const newXml = page(region("main", "Region", component("A") + component("B")));
  mkdirSync(join(repo, "force-app", "main", "default", "flexipages"), { recursive:true });
  writeFileSync(absolute, oldXml, "utf8");
  git(repo, ["init", "-q"]); git(repo, ["config", "user.email", "codex@example.com"]); git(repo, ["config", "user.name", "Codex"]); git(repo, ["add", "."]); git(repo, ["commit", "-m", "old"]);
  const from = git(repo, ["rev-parse", "HEAD"]);
  writeFileSync(absolute, newXml, "utf8"); git(repo, ["add", "."]); git(repo, ["commit", "-m", "new"]);
  const to = git(repo, ["rev-parse", "HEAD"]);
  await flexiPageCliMain(["--from", from, "--to", to, "--repo", repo, "--path", "force-app/**/*.flexipage-meta.xml", "--changed-only", "--out", out, "--json"]);
  const diffFile = readdirSync(out).find((file) => file.endsWith(".diff.json"));
  assert.ok(diffFile);
  assert.deepEqual(JSON.parse(readFileSync(join(out, diffFile!), "utf8")), diffPage(await parseFlexiPage(oldXml), await parseFlexiPage(newXml)));
});

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding:"utf8", env:{ ...process.env, GIT_AUTHOR_NAME:"Codex", GIT_AUTHOR_EMAIL:"codex@example.com", GIT_COMMITTER_NAME:"Codex", GIT_COMMITTER_EMAIL:"codex@example.com" } }).trim();
}

function geometrySlots(geometry: TemplateGeometry): string[] {
  return geometry.rows.flatMap((row) => row.flatMap((cell) => "stack" in cell
    ? cell.stack.flatMap((child) => Array.isArray(child) ? geometrySlots({ label: "nested", rows: [child] }) : [child.slot])
    : [cell.slot]));
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
