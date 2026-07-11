import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowParser } from "../src/parser/flow_parser.ts";
import { buildModel } from "../src/model/build-model.ts";
import { extractFlowHeader } from "../src/model/flow-header.ts";
import { deepDiff } from "../src/diff/deep-diff.ts";
import { diffModel } from "../src/diff/diff-model.ts";
import { layoutDiff } from "../src/render/layout.ts";
import { THEME_STORAGE_KEY, renderHtml } from "../src/render/render-html.ts";
import { getSectionSchemas } from "../src/render/section-schemas.ts";
import { renderNodePanelBody } from "../src/render/snapshot-panel.ts";
import { main } from "../src/cli.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_XML = readFileSync(join(ROOT, "fixtures", "parse", "sample.flow-meta.xml"), "utf8");

test("canonicalization removes cosmetic-only changes", async () => {
  const original = await parseXml(SAMPLE_XML);
  const mutated = structuredClone(original);

  if (mutated.start) {
    mutated.start.locationX = 999;
    mutated.start.locationY = 999;
  }
  if (mutated.assignments?.[0]) {
    mutated.assignments[0].locationX = 777;
    mutated.assignments[0].locationY = 888;
  }
  if (mutated.decisions) {
    mutated.decisions.reverse();
  }

  const diff = diffModel(buildModel(original), buildModel(mutated));
  assert.equal(diff.summary.addedNodes, 0);
  assert.equal(diff.summary.removedNodes, 0);
  assert.equal(diff.summary.modifiedNodes, 0);
  assert.equal(diff.summary.addedEdges, 0);
  assert.equal(diff.summary.removedEdges, 0);
});

test("deepDiff reports exact property paths", () => {
  assert.deepEqual(deepDiff({ a: 1 }, { a: 2 }), [
    { path: "a", before: 1, after: 2 },
  ]);
  assert.deepEqual(deepDiff({ nested: { value: "old" } }, { nested: { value: "new" } }), [
    { path: "nested.value", before: "old", after: "new" },
  ]);
  assert.deepEqual(deepDiff({ items: [1, 2] }, { items: [1, 3, 4] }), [
    { path: "items[1]", before: 2, after: 3 },
    { path: "items[2]", before: undefined, after: 4 },
  ]);
  assert.deepEqual(deepDiff({ value: { a: 1 } }, { value: "x" }), [
    { path: "value", before: { a: 1 }, after: "x" },
  ]);
});

test("extractFlowHeader returns curated root scalar attributes only", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>59.0</apiVersion>
  <description>Line one</description>
  <interviewLabel>Header {!$Flow.CurrentDateTime}</interviewLabel>
  <isTemplate>false</isTemplate>
  <processMetadataValues><name>BuilderType</name></processMetadataValues>
  <processType>AutoLaunchedFlow</processType>
  <runInMode>SystemModeWithoutSharing</runInMode>
  <status>Active</status>
  <triggerOrder>10</triggerOrder>
</Flow>`;

  assert.deepEqual(await extractFlowHeader(xml), {
    status: "Active",
    processType: "AutoLaunchedFlow",
    runInMode: "SystemModeWithoutSharing",
    apiVersion: "59.0",
    triggerOrder: "10",
    description: "Line one",
    interviewLabel: "Header {!$Flow.CurrentDateTime}",
    isTemplate: "false",
  });
});

test("extractFlowHeader omits missing keys and tolerates malformed XML", async () => {
  assert.deepEqual(await extractFlowHeader("<Flow><status>Draft</status></Flow>"), { status: "Draft" });
  assert.deepEqual(await extractFlowHeader("<Flow><description><nested>value</nested></description></Flow>"), {});
  assert.deepEqual(await extractFlowHeader("<Package><types /></Package>"), {});
  assert.deepEqual(await extractFlowHeader("<not xml"), {});
});

test("diffModel classifies added, deleted, modified, and edge rewires", async () => {
  const original = await parseXml(SAMPLE_XML);

  const modifiedFlow = structuredClone(original);
  const decision = modifiedFlow.decisions?.find((node) => node.name === "Was_Tag_Definition_c_found");
  assert.ok(decision);
  assert.equal(decision.rules[0].conditions[0].rightValue.booleanValue, "true");
  decision.rules[0].conditions[0].rightValue.booleanValue = "false";

  const rewireFlow = structuredClone(original);
  const assignment = rewireFlow.assignments?.find((node) => node.name === "Populate_Tag");
  assert.ok(assignment);
  assignment.connector.targetReference = "Add_No_Tag_Definition_Found_Error";
  rewireFlow.transitions = rewireFlow.transitions?.map((transition) =>
    transition.from === "Populate_Tag"
      ? { ...transition, to: "Add_No_Tag_Definition_Found_Error" }
      : transition,
  );

  const baseDiff = diffModel(buildModel(original), buildModel(structuredClone(original)));
  assert.equal(baseDiff.summary.modifiedNodes, 0);

  const modifiedDiff = diffModel(buildModel(original), buildModel(modifiedFlow));
  const modifiedNode = modifiedDiff.nodes.find((node) => node.id === "Was_Tag_Definition_c_found");
  assert.equal(modifiedNode?.status, "modified");
  assert.ok(modifiedNode?.changes?.some((change) => change.path === "rules[0].conditions[0].rightValue.booleanValue"));

  const rewiredDiff = diffModel(buildModel(original), buildModel(rewireFlow));
  assert.equal(rewiredDiff.summary.addedEdges, 1);
  assert.equal(rewiredDiff.summary.removedEdges, 1);
  assert.equal(rewiredDiff.nodes.find((node) => node.id === "Populate_Tag")?.status, "unchanged");

  const added = diffModel(
    {
      flowName: "x",
      label: "x",
      nodes: [{ id: "A", type: "start", label: "A", properties: {} }],
      edges: [],
    },
    {
      flowName: "x",
      label: "x",
      nodes: [
        { id: "A", type: "start", label: "A", properties: {} },
        { id: "B", type: "decision", label: "B", properties: {} },
      ],
      edges: [],
    },
  );
  assert.equal(added.summary.addedNodes, 1);
  const addedNode = added.nodes.find((node) => node.id === "B");
  assert.equal(addedNode?.status, "added");
  assert.deepEqual(addedNode?.after, {});
  assert.equal(addedNode?.before, undefined);

  const deleted = diffModel(
    {
      flowName: "x",
      label: "x",
      nodes: [
        { id: "A", type: "start", label: "A", properties: {} },
        { id: "B", type: "decision", label: "B", properties: {} },
      ],
      edges: [],
    },
    {
      flowName: "x",
      label: "x",
      nodes: [{ id: "A", type: "start", label: "A", properties: {} }],
      edges: [],
    },
  );
  assert.equal(deleted.summary.removedNodes, 1);
  const deletedNode = deleted.nodes.find((node) => node.id === "B");
  assert.equal(deletedNode?.status, "deleted");
  assert.deepEqual(deletedNode?.before, {});
  assert.equal(deletedNode?.after, undefined);
});

test("edge ids distinguish normal and fault connectors", () => {
  const graph = {
    flowName: "x",
    label: "x",
    nodes: [
      { id: "A", type: "start", label: "A", properties: {} },
      { id: "B", type: "actionCall", label: "B", properties: {} },
    ],
    edges: [
      { id: "A->B#normal#", source: "A", target: "B", kind: "normal" as const },
      { id: "A->B#fault#", source: "A", target: "B", kind: "fault" as const },
    ],
  };
  const diff = diffModel(graph, graph);
  assert.equal(diff.edges.length, 2);
  assert.equal(diff.edges.filter((edge) => edge.status === "unchanged").length, 2);
});

test("diffModel reports ordered flow-level attribute changes in the summary", () => {
  const before = model({ id: "A", type: "start", label: "A", properties: {} });
  const after = model({ id: "A", type: "start", label: "A", properties: {} });
  before.header = { status: "Active", apiVersion: "58.0", runInMode: "DefaultMode" };
  after.header = { status: "Draft", apiVersion: "59.0", runInMode: "SystemModeWithoutSharing" };

  const diff = diffModel(before, after);

  assert.equal(diff.summary.changedFlowAttributes, 3);
  assert.deepEqual(diff.flowChanges?.map((change) => change.path), ["status", "runInMode", "apiVersion"]);
  assert.deepEqual(diff.flowChanges?.find((change) => change.path === "status"), {
    path: "status",
    before: "Active",
    after: "Draft",
  });
});

test("diffModel skips flow-level changes when one side has no header", () => {
  const before = model({ id: "A", type: "start", label: "A", properties: {} });
  before.header = { status: "Active" };
  const after = {
    flowName: "(unknown)",
    label: "(unknown)",
    nodes: [],
    edges: [],
  } as Parameters<typeof diffModel>[0];

  const diff = diffModel(before, after);

  assert.equal(diff.summary.changedFlowAttributes, 0);
  assert.equal(diff.flowChanges, undefined);
});

test("diffModel includes a stable zero flow-attribute summary on unchanged flows", () => {
  const before = model({ id: "A", type: "start", label: "A", properties: {} });
  const after = model({ id: "A", type: "start", label: "A", properties: {} });
  before.header = { status: "Active" };
  after.header = { status: "Active" };

  const diff = diffModel(before, after);

  assert.equal(diff.summary.changedFlowAttributes, 0);
  assert.equal(diff.flowChanges, undefined);
});

test("buildModel connects reachable nodes without normal exits to END", async () => {
  const model = buildModel(await parseXml(SAMPLE_XML));
  const terminalSources = model.edges
    .filter((edge) => edge.target === "END")
    .map((edge) => edge.source)
    .sort();

  assert.deepEqual(terminalSources, [
    "Add_Issue_Inserting_Tag_Record_Error",
    "Add_No_Tag_Definition_Found_Error",
    "Insert_Tag",
  ]);
});

test("renderHtml emits a self-contained document with node ids and status classes", async () => {
  const diff = diffModel(buildModel(await parseXml(SAMPLE_XML)), buildModel(await parseXml(SAMPLE_XML)));
  const layout = await layoutDiff(diff);
  const html = renderHtml(layout);

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html/i);
  assert.match(html, /class="node unchanged type-/);
  assert.match(html, /class="legend"/);
  assert.match(html, /data-view-mode="all"/);
  assert.match(html, /data-view-mode="after"/);
  assert.match(html, /data-view-mode="before"/);
  assert.match(html, /data-view-mode="changes"/);
  assert.match(html, /aria-label="Color theme"/);
  assert.match(html, /data-theme-choice="system"/);
  assert.match(html, /data-theme-choice="light"/);
  assert.match(html, /data-theme-choice="dark"/);
  assert.match(html, /flow-delta-theme/);
  assert.equal([...html.matchAll(new RegExp(THEME_STORAGE_KEY, "g"))].length, 2);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.match(html, /:root\[data-theme="dark"\]/);
  assert.match(html, /panel-resizer:hover::before, \.panel-resizer\.dragging::before \{ background: var\(--focus\); width: 3px; \}/);
  assert.match(html, /function applyView\(mode\)/);
  assert.match(html, /function applyTheme\(theme\)/);
  assert.match(html, /function round\(value\)/);
  assert.match(html, /function measureVisibleBounds\(nodes, edges\)/);
  assert.match(html, /function fitViewBoxRect\(bounds\)/);
  assert.match(html, /const DATA = /);
  assert.match(html, /if \(event\.target\.closest\("\.node"\)\) return;/);
  assert.ok(!html.includes("activeView"));
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) clamp\(300px, var\(--panel-width\), 70vw\)/);
  assert.match(html, /id="panel-resizer"/);
  assert.match(html, /id="panel-toggle"/);
  assert.match(html, /id="panel-reopen"/);
  assert.match(html, /function setPanelCollapsed\(collapsed\)/);
  assert.match(html, /function renderNodePanelBody\(node,\s*schemas/);
  assert.match(html, /function diffValue\(before,\s*after\)/);
  assert.match(html, /detail-section snapshot-section/);
  assert.match(html, /function renderTable\(before,\s*after,\s*paths,\s*columns,\s*options\)/);
  assert.match(html, /change-kind/);
  assert.match(html, /function unwrapValue\(value\)/);
  assert.match(html, /val ins/);
  assert.ok(!html.includes("http://"));
  assert.ok(!html.includes("https://"));
  for (const node of layout.nodes) {
    assert.ok(html.includes(node.id));
  }
});

test("renderHtml emits a flow-level banner for deactivation changes only", async () => {
  const before = model({ id: "A", type: "start", label: "A", properties: {} });
  const after = model({ id: "A", type: "start", label: "A", properties: {} });
  before.header = { status: "Active", apiVersion: "58.0" };
  after.header = { status: "Draft", apiVersion: "59.0" };

  const html = renderHtml(await layoutDiff(diffModel(before, after)));

  assert.match(html, /id="flow-tab" class="flow-tab deactivated"/);
  assert.match(html, /Deactivated \(Active -> Draft\)/);
  assert.match(html, /Api Version/);
  assert.match(html, /flow-change-value \{ min-width: 0; max-height: 180px; overflow: auto; \}/);
  assert.match(html, /val del/);
  assert.match(html, /val ins/);
  assert.ok(!html.includes("http://"));
  assert.ok(!html.includes("https://"));

  const unchangedHtml = renderHtml(await layoutDiff(diffModel(model({ id: "A", type: "start", label: "A", properties: {} }), model({ id: "A", type: "start", label: "A", properties: {} }))));
  assert.ok(!unchangedHtml.includes("id=\"flow-tab\""));
});

test("renderHtml emits an apiVersion-only banner without activation callout", async () => {
  const before = model({ id: "A", type: "start", label: "A", properties: {} });
  const after = model({ id: "A", type: "start", label: "A", properties: {} });
  before.header = { apiVersion: "58.0" };
  after.header = { apiVersion: "59.0" };

  const html = renderHtml(await layoutDiff(diffModel(before, after)));

  assert.match(html, /id="flow-tab" class="flow-tab neutral"/);
  assert.match(html, /Api Version/);
  assert.match(html, /58\.0/);
  assert.match(html, /59\.0/);
  assert.doesNotMatch(html, /<div class="flow-banner-callout/);
});

test("renderHtml closes the flow popover when a node is selected, not just on generic outside clicks", async () => {
  const before = model({ id: "A", type: "start", label: "A", properties: {} });
  const after = model({ id: "A", type: "start", label: "A", properties: {} });
  before.header = { status: "Active", apiVersion: "58.0" };
  after.header = { status: "Draft", apiVersion: "59.0" };

  const html = renderHtml(await layoutDiff(diffModel(before, after)));

  // Node clicks call event.stopPropagation(), so they never reach the
  // document-level "outside click" listener that closes the flow popover.
  // The node click handler must close it directly instead.
  assert.match(html, /function closeFlowPopover\(\)/);
  assert.match(
    html,
    /node\.addEventListener\("click", \(event\) => \{\s*event\.stopPropagation\(\);\s*closeFlowPopover\(\);\s*selectNode\(node\.dataset\.nodeId\);/,
  );
  // event.target !== flowTab is unreachable: any click on the tab or its
  // children is already stopped by the tab's own handler before it can
  // bubble to document, so that branch must not be reintroduced.
  assert.doesNotMatch(html, /event\.target !== flowTab/);
});

test("section schemas name high-impact node property groups", () => {
  const screen = getSectionSchemas("screen");
  assert.equal(screen[0].name, "Screen Settings");
  assert.equal(screen.length, 1);

  const start = getSectionSchemas("start");
  assert.deepEqual(start.map((schema) => schema.name), ["Trigger", "Entry Conditions", "Scheduled Paths"]);

  const decision = getSectionSchemas("decision");
  assert.equal(decision[0].name, "Outcomes");
  assert.deepEqual(decision[0].paths, ["rules"]);
  assert.equal(decision[0].render, "grouped-table");
  assert.equal(decision[0].innerArray, "conditions");
  assert.deepEqual(decision[0].innerColumns?.map((c) => c.label), ["Resource", "Operator", "Value"]);

  const create = getSectionSchemas("recordCreate");
  assert.equal(create[0].name, "Field Mappings");
  assert.equal(create[0].render, "table");
  assert.deepEqual(create[0].columns?.map((c) => c.path), ["field", "value"]);

  assert.equal(getSectionSchemas("recordUpdate")[0].name, "Field Mappings");
  assert.equal(getSectionSchemas("recordLookup")[0].name, "Filters");
  assert.equal(getSectionSchemas("assignment")[0].name, "Assignment Items");

  const params = getSectionSchemas("actionCall");
  assert.equal(params[0].name, "Parameters");
  assert.deepEqual(params[0].paths, ["inputParameters", "outputParameters"]);

  assert.equal(getSectionSchemas("subflow")[0].name, "Parameters");
  assert.equal(getSectionSchemas("customError")[0].name, "Error Messages");
  assert.equal(getSectionSchemas("transform")[0].name, "Value Mappings");
  assert.equal(getSectionSchemas("collectionProcessor")[0].name, "Collection Settings");
  assert.equal(getSectionSchemas("orchestratedStage")[0].name, "Stage Settings");
  assert.equal(getSectionSchemas("orchestratedStage").length, 1);
  assert.deepEqual(getSectionSchemas("unknown"), []);
});

test("renderHtml embeds semantic schemas and generic grouping fallback", async () => {
  const diff = await diffFixture("modify_decision");
  const html = renderHtml(await layoutDiff(diff));
  const data = extractData(html);

  assert.equal(data.sectionSchemas.decision[0].name, "Outcomes");
  assert.equal(data.sectionSchemas.decision[0].render, "grouped-table");
  assert.match(html, /function renderSections\(before,\s*after,\s*schemas,\s*options\)/);
  assert.match(html, /function renderGroupedTable\(before,\s*after,\s*schema,\s*options\)/);
  assert.match(html, /snapshot-section/);
  assert.match(html, /snapshot-section/);
});

test("renderHtml embeds per-view layouts that only reference visible nodes and edges", async () => {
  const diff = await diffFixture("add_node");
  const html = renderHtml(await layoutDiff(diff));
  const data = extractData(html);

  assert.ok(Array.isArray(data.diff.nodes));
  assert.ok(data.diff.nodes.every((node: { status: string }) => typeof node.status === "string"));
  assert.ok(data.diff.edges.every((edge: { status: string }) => typeof edge.status === "string"));
  assert.ok(data.layouts.union);
  assert.ok(data.layouts.after);
  assert.ok(data.layouts.before);

  const expectedNodeIds = {
    union: new Set(data.diff.nodes.map((node: { id: string }) => node.id)),
    after: new Set(data.diff.nodes.filter((node: { status: string }) => node.status !== "deleted").map((node: { id: string }) => node.id)),
    before: new Set(data.diff.nodes.filter((node: { status: string }) => node.status !== "added").map((node: { id: string }) => node.id)),
  };

  for (const [name, expectedIds] of Object.entries(expectedNodeIds)) {
    const layoutView = data.layouts[name];
    assert.ok(layoutView.nodes.every((node: { id: string }) => expectedIds.has(node.id)), `${name} nodes`);
    assert.ok(layoutView.edges.every((edge: { source: string; target: string }) => expectedIds.has(edge.source) && expectedIds.has(edge.target)), `${name} edges`);
  }
});

test("renderHtml client script executes against a lightweight DOM smoke harness", async () => {
  const diff = await diffFixture("rewire_connector");
  const html = renderHtml(await layoutDiff(diff));
  const data = extractData(html);
  const script = extractClientScript(html);
  const dom = createMockDom(data);

  runInNewContext(script, dom.context);

  assert.equal(dom.elements.svg.viewBox.baseVal.width, 720);
  assert.equal(dom.elements.filterButtons[0].attributes["aria-pressed"], "true");
  assert.equal(dom.elements.filterButtons[1].attributes["aria-pressed"], "false");
  assert.equal(dom.elements.filterButtons[2].attributes["aria-pressed"], "false");
  assert.equal(dom.elements.filterButtons[3].attributes["aria-pressed"], "false");
  assert.ok(dom.elements.nodeById.get(data.nodes[0].id)?.attributes["transform"]);

  for (const viewMode of ["after", "before", "changes"]) {
    dom.elements.filterButtons.find((button) => button.dataset.viewMode === viewMode)?.dispatch("click");
    for (const button of dom.elements.filterButtons) {
      const expected = button.dataset.viewMode === viewMode;
      assert.equal(button.attributes["aria-pressed"], expected ? "true" : "false");
    }
  }

  for (const theme of ["light", "dark", "system"]) {
    dom.elements.themeButtons.find((button) => button.dataset.themeChoice === theme)?.dispatch("click");
    assert.equal(dom.elements.documentElement.dataset.theme, theme);
    assert.equal(dom.localStorage.values[THEME_STORAGE_KEY], theme);
    for (const button of dom.elements.themeButtons) {
      const expected = button.dataset.themeChoice === theme;
      assert.equal(button.attributes["aria-pressed"], expected ? "true" : "false");
    }
  }
});

test("decision panel renders per-outcome group with a conditions table and unwrapped values", async () => {
  const diff = await diffFixture("modify_decision");
  const html = renderHtml(await layoutDiff(diff));
  const data = extractData(html);
  const dom = createMockDom(data);
  runInNewContext(extractClientScript(html), dom.context);

  dom.elements.nodeById.get("Includes_Jawn")?.dispatch("click");
  const panel = dom.context.document.getElementById("panel-body").innerHTML;

  // Grouped under the outcome, not a flat path-keyed table.
  assert.match(panel, /class='outcome-group'/);
  assert.match(panel, /class='change-table'/);
  // Conditions columns are semantic, not raw metadata paths.
  assert.match(panel, /<th>Resource<\/th>/);
  assert.match(panel, /<th>Operator<\/th>/);
  assert.match(panel, /<th>Value<\/th>/);
  // The removed condition shows its values struck through (git-diff grammar), unwrapped.
  assert.match(panel, /row-removed/);
  assert.match(panel, /val del'>\$Record\.CreatedById/);
  assert.match(panel, /val del'>IsNull/);
  // Typed wrapper unwrapped to the scalar — no JSON blob.
  assert.ok(!panel.includes("booleanValue"), "rightValue wrapper should be unwrapped");
});

test("assignment panel renders an added item as one badged table row", async () => {
  const diff = await diffFixture("modify_assignment");
  const html = renderHtml(await layoutDiff(diff));
  const data = extractData(html);
  const dom = createMockDom(data);
  runInNewContext(extractClientScript(html), dom.context);

  dom.elements.nodeById.get("Jawn_that_Jawn")?.dispatch("click");
  const panel = dom.context.document.getElementById("panel-body").innerHTML;

  assert.match(panel, /Assignment Items/);
  assert.match(panel, /<th>Variable<\/th>/);
  // Whole-item add is one row with an Added badge, not three sub-field rows.
  assert.match(panel, /row-added/);
  assert.equal([...panel.matchAll(/class='change-kind added'/g)].length, 1);
  // elementReference unwrapped to {!ref} merge syntax.
  assert.match(panel, /\{!AddJawnToName\}/);
  assert.ok(!panel.includes("elementReference"), "value wrapper should be unwrapped");
});

test("snapshot panel renders full added screen contents with generic recursion", () => {
  const html = renderNodePanelBody({
    status: "added",
    after: {
      fields: {
        name: "MainRegion",
        fieldType: "RegionContainer",
        fields: {
          name: "LeftColumn",
          fieldType: "Region",
          fields: {
            name: "WelcomeText",
            fieldType: "DisplayText",
            fieldText: "<p>Hello reviewer</p>",
          },
        },
      },
      showFooter: { booleanValue: "true" },
    },
  }, []);

  assert.match(html, /snapshot-section added/);
  assert.match(html, /<summary>Field/);
  assert.match(html, /MainRegion/);
  assert.match(html, /LeftColumn/);
  assert.match(html, /WelcomeText/);
  assert.match(html, /Hello reviewer/);
  assert.match(html, /val one-sided'>true/);
  assert.ok(!html.includes("This node was added"));
});

test("snapshot panel renders deleted node contents symmetrically", () => {
  const html = renderNodePanelBody({
    status: "deleted",
    before: {
      object: "Account",
      filters: [{ field: "Name", operator: "EqualTo", value: { stringValue: "Acme" } }],
    },
  }, getSectionSchemas("recordLookup"));

  assert.match(html, /snapshot-section deleted/);
  assert.match(html, /Filters/);
  assert.match(html, /Name/);
  assert.match(html, /EqualTo/);
  assert.match(html, /Acme/);
  assert.ok(!html.includes("This node was removed"));
});

test("snapshot panel bounds long string blobs without truncating them", () => {
  const longText = "Long rich text ".repeat(30);
  const html = renderNodePanelBody({
    status: "added",
    after: {
      fieldText: longText,
    },
  }, []);

  assert.match(html, /<pre>/);
  assert.match(html, /Long rich text Long rich text/);
  assert.ok(html.includes(longText.trim()));
});

test("snapshot panel treats known schema-less single-child collections as lists", () => {
  const html = renderNodePanelBody({
    status: "added",
    after: {
      customErrorMessages: {
        name: "MissingAccount",
        errorMessage: "Account is required",
      },
    },
  }, []);

  assert.match(html, /Custom error message/);
  assert.match(html, /snapshot-card added/);
  assert.match(html, /MissingAccount/);
  assert.match(html, /Account is required/);
});

test('fixture "add_screen" renders the added screen\'s nested contents end-to-end', async () => {
  const diff = await diffFixture("add_screen");
  const node = diff.nodes.find((n) => n.id === "Configure_Options");
  assert.equal(node?.status, "added", "screen should be classified added");
  assert.equal(node?.type, "screen");
  assert.equal(node?.before, undefined);
  assert.ok(node?.after, "added screen should carry its after snapshot");

  // Render straight from the real parsed/diffed snapshot — this is the path the
  // synthetic unit tests bypass, so it exercises real xml2js output.
  const html = renderNodePanelBody(node as never, getSectionSchemas("screen"));

  // Generic recursion walks RegionContainer -> Region -> component.
  assert.match(html, /RegionContainer/);
  assert.match(html, /Region/);
  assert.match(html, /Transfer_Notes/);
  assert.match(html, /Keep the Account Team/);
  // The single-column container's `fields` deserializes as an OBJECT (xml2js
  // single-child) and must still render as a member, not vanish.
  assert.match(html, /Single_Column_Section_Column1/);
  // Region width inputParameters render as a Name/Value table.
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<th>Value<\/th>/);
  // Big HTML fieldText is shown in full; its card title is the stripped text.
  assert.match(html, /Choose how the records should be transferred/);
  // Top-level scalar screen settings are grouped into one compact typed section,
  // not separate one-row collapsible sections.
  assert.match(html, /<summary>Screen Settings <span class='section-count'>\(5\)<\/span><\/summary>/);
  assert.match(html, /<th>Allow Back<\/th><td><span class='val one-sided'>true<\/span><\/td>/);
  assert.match(html, /<th>Allow Finish<\/th><td><span class='val one-sided'>false<\/span><\/td>/);
  assert.match(html, /<summary>Field <span class='section-count'>/);
  assert.doesNotMatch(html, /snapshot-card-title'>Item 1<\/div>[\s\S]*RegionContainer/);
  assert.doesNotMatch(html, /<summary>Allow Back <span class='section-count'>/);
  assert.doesNotMatch(html, /<summary>Allow Finish <span class='section-count'>/);
  // Neutral one-sided accent, not saturated green; no placeholder.
  assert.match(html, /val one-sided/);
  assert.ok(!html.includes("This node was added"));
});

test("addendum A schemas render common schema-less node types with named sections", () => {
  const startHtml = renderNodePanelBody({
    status: "added",
    after: {
      object: "Account",
      recordTriggerType: "CreateAndUpdate",
      filterLogic: "and",
      filters: [{ field: "Name", operator: "IsNull", value: { booleanValue: "false" } }],
      scheduledPaths: { name: "Follow_Up", label: "Follow Up", offsetNumber: "1", offsetUnit: "Days", timeSource: "Record" },
    },
  }, getSectionSchemas("start"));

  assert.match(startHtml, /Trigger/);
  assert.match(startHtml, /Entry Conditions/);
  assert.match(startHtml, /Scheduled Paths/);
  assert.match(startHtml, /<th>Time Source<\/th>/);
  assert.match(startHtml, /Follow Up/);

  const subflowHtml = renderNodePanelBody({
    status: "added",
    after: {
      flowName: "Child_Flow",
      inputAssignments: [{ name: "recordId", value: { elementReference: "Record.Id" } }],
      outputAssignments: [{ name: "result", assignToReference: "childResult" }],
    },
  }, getSectionSchemas("subflow"));

  assert.match(subflowHtml, /Parameters/);
  assert.match(subflowHtml, /<th>Assign To<\/th>/);
  assert.match(subflowHtml, /\{!Record\.Id\}/);

  const customErrorHtml = renderNodePanelBody({
    status: "added",
    after: {
      customErrorMessages: { name: "MissingAccount", errorMessage: "Account is required" },
    },
  }, getSectionSchemas("customError"));

  assert.match(customErrorHtml, /Error Messages/);
  assert.match(customErrorHtml, /<th>Message<\/th>/);
  assert.match(customErrorHtml, /Account is required/);

  const transformHtml = renderNodePanelBody({
    status: "added",
    after: {
      transformValues: [{ name: "MapName", sourceDataType: "String", targetDataType: "String", value: { stringValue: "Acme" } }],
      dataTypeMappings: { name: "AmountMapping", sourceDataType: "Currency", targetDataType: "Number" },
    },
  }, getSectionSchemas("transform"));

  assert.match(transformHtml, /Value Mappings/);
  assert.match(transformHtml, /Data Type Mappings/);
  assert.match(transformHtml, /<th>Source Type<\/th>/);

  const collectionHtml = renderNodePanelBody({
    status: "added",
    after: {
      collectionReference: "records",
      operation: "Filter",
      filters: [{ field: "Status", operator: "EqualTo", value: { stringValue: "Open" } }],
      sortOptions: { field: "CreatedDate", sortOrder: "Desc" },
    },
  }, getSectionSchemas("collectionProcessor"));

  assert.match(collectionHtml, /Collection Settings/);
  assert.match(collectionHtml, /Sort Options/);
  assert.match(collectionHtml, /CreatedDate/);

  const stageHtml = renderNodePanelBody({
    status: "added",
    after: {
      stageLabel: "Review",
      stageOrder: "1",
      stageSteps: { name: "Approve", label: "Approve Request" },
    },
  }, getSectionSchemas("orchestratedStage"));

  assert.match(stageHtml, /Stage Settings/);
  assert.match(stageHtml, /Stage Steps/);
  assert.match(stageHtml, /snapshot-card added/);
  assert.doesNotMatch(stageHtml, /snapshot-card-title'>Item 1<\/div>[\s\S]*Approve Request/);
  assert.match(stageHtml, /Approve Request/);
});

test('fixture "delete_node" renders the deleted node\'s prior contents symmetrically', async () => {
  const diff = await diffFixture("delete_node");
  const node = diff.nodes.find((n) => n.id === "Get_Accounts");
  assert.equal(node?.status, "deleted");
  assert.equal(node?.type, "recordLookup");
  assert.equal(node?.after, undefined);
  assert.ok(node?.before, "deleted node should carry its before snapshot");

  const html = renderNodePanelBody(node as never, getSectionSchemas("recordLookup"));

  assert.match(html, /snapshot-section deleted/);
  // The schema Filters table renders the prior filter row.
  assert.match(html, /Filters/);
  assert.match(html, /Name/);
  assert.match(html, /NotEqualTo/);
  assert.match(html, /Test Account/);
  assert.match(html, /Account/);
  assert.ok(!html.includes("This node was removed"));
});

async function renderPanel(diff: ReturnType<typeof diffModel>, nodeId: string) {
  const html = renderHtml(await layoutDiff(diff));
  const dom = createMockDom(extractData(html));
  runInNewContext(extractClientScript(html), dom.context);
  dom.elements.nodeById.get(nodeId)?.dispatch("click");
  return dom.context.document.getElementById("panel-body").innerHTML as string;
}

function model(node: { id: string; type: string; label: string; properties: Record<string, unknown> }) {
  return {
    flowName: "F",
    label: "F",
    nodes: [{ id: node.id, type: node.type, label: node.label, properties: node.properties }],
    edges: [],
  } as Parameters<typeof diffModel>[0];
}

test("modified table row keeps unchanged sibling columns as context (Finding 2)", async () => {
  const condition = { leftValueReference: "isWin", operator: "EqualTo", rightValue: { booleanValue: "true" } };
  const before = model({ id: "D", type: "decision", label: "D", properties: { rules: [{ label: "R1", conditions: [condition] }] } });
  const after = model({ id: "D", type: "decision", label: "D", properties: { rules: [{ label: "R1", conditions: [{ ...condition, operator: "NotEqualTo" }] }] } });
  const panel = await renderPanel(diffModel(before, after), "D");

  // Only the operator changed, but the row still shows Resource and Value for context.
  assert.match(panel, /val del'>EqualTo/);
  assert.match(panel, /val ins'>NotEqualTo/);
  assert.match(panel, /val faint'>isWin/, "unchanged Resource shown as context");
  assert.match(panel, /val faint'>true/, "unchanged Value shown as context (unwrapped)");
});

test("wholly added outcome shows one group badge, no per-row Change column (Finding 3)", async () => {
  const ruleA = { label: "R1", conditions: [{ leftValueReference: "a", operator: "EqualTo", rightValue: { booleanValue: "true" } }] };
  const ruleB = { label: "R2", conditionLogic: "and", conditions: [{ leftValueReference: "b", operator: "IsNull", rightValue: { booleanValue: "false" } }] };
  const before = model({ id: "D", type: "decision", label: "D", properties: { rules: [ruleA] } });
  const after = model({ id: "D", type: "decision", label: "D", properties: { rules: [ruleA, ruleB] } });
  const panel = await renderPanel(diffModel(before, after), "D");

  // Exactly one Added badge (the group header) — not one per scalar/condition row.
  assert.equal([...panel.matchAll(/class='change-kind added'/g)].length, 1);
  // The wholly-added group's inner table drops the redundant Change column.
  assert.ok(!panel.includes("<th>Change</th>"), "uniform-kind group omits the Change column");
  assert.match(panel, /group-label'>R2/);
});

test("scalar-only generic change renders in the Settings table", async () => {
  const before = model({ id: "C", type: "recordCreate", label: "C", properties: { object: "Account", inputAssignments: [] } });
  const after = model({ id: "C", type: "recordCreate", label: "C", properties: { object: "Contact", inputAssignments: [] } });
  const panel = await renderPanel(diffModel(before, after), "C");

  assert.match(panel, /<summary>Settings <span class='section-count'>\(1\)<\/span><\/summary>/);
  assert.match(panel, /<th>Object<\/th>/);
  assert.match(panel, /val del'>Account/);
  assert.match(panel, /val ins'>Contact/);
  assert.ok(!panel.includes("change-table"), "a flat scalar must not be forced into a schema change table");
});

test("filter table unwraps numberValue and unknown node types fall back without error", async () => {
  const before = model({ id: "L", type: "recordLookup", label: "L", properties: { object: "ApexLog", filters: [] } });
  const after = model({ id: "L", type: "recordLookup", label: "L", properties: { object: "ApexLog", filters: [{ field: "LogLength", operator: "GreaterThan", value: { numberValue: "99.0" } }] } });
  const lookupPanel = await renderPanel(diffModel(before, after), "L");
  assert.match(lookupPanel, /<th>Filters<\/th>|Filters/);
  assert.match(lookupPanel, /val ins'>99\.0/, "numberValue unwrapped");
  assert.ok(!lookupPanel.includes("numberValue"));

  const ub = model({ id: "U", type: "unknown", label: "U", properties: { foo: "x", items: ["a"] } });
  const ua = model({ id: "U", type: "unknown", label: "U", properties: { foo: "y", items: ["a", "b"] } });
  const unknownPanel = await renderPanel(diffModel(ub, ua), "U");
  assert.match(unknownPanel, /detail-section/, "unknown type still renders grouped sections");
  assert.match(unknownPanel, /<summary>Settings <span class='section-count'>\(1\)<\/span><\/summary>/);
  assert.match(unknownPanel, /<th>Foo<\/th>/);
});

test("renderHtml positions node labels within their translated node groups", async () => {
  const diff = diffModel(buildModel(await parseXml(SAMPLE_XML)), buildModel(await parseXml(SAMPLE_XML)));
  const layout = await layoutDiff(diff);
  const html = renderHtml(layout);
  const textYValues = [...html.matchAll(/<text x="[^"]+" y="([^"]+)"/g)].map((match) => Number(match[1]));

  assert.equal(textYValues.length, layout.nodes.length);
  assert.ok(textYValues.every((textY) => textY > 0 && textY < 48));
});

test("CLI git mode writes diff.json that matches file-mode output", async () => {
  const repoDir = mkdtempSync(join(tmpdir(), "flow-delta-git-"));
  const outDir = mkdtempSync(join(tmpdir(), "flow-delta-out-"));
  const flowRelPath = "flows/sample.flow-meta.xml";
  const flowAbsPath = join(repoDir, flowRelPath);
  mkdirSync(dirname(flowAbsPath), { recursive: true });

  const oldXml = SAMPLE_XML;
  const newXml = SAMPLE_XML.replace("<booleanValue>true</booleanValue>", "<booleanValue>false</booleanValue>");
  writeFileSync(flowAbsPath, oldXml, "utf8");
  git(repoDir, ["init", "-q"]);
  git(repoDir, ["config", "user.email", "codex@example.com"]);
  git(repoDir, ["config", "user.name", "Codex"]);
  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "old"]);
  const oldSha = git(repoDir, ["rev-parse", "HEAD"]);

  writeFileSync(flowAbsPath, newXml, "utf8");
  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "new"]);
  const newSha = git(repoDir, ["rev-parse", "HEAD"]);

  await main([
    "--from", oldSha,
    "--to", newSha,
    "--repo", repoDir,
    "--path", flowRelPath,
    "--out", outDir,
    "--json",
  ]);

  const diffFiles = readdirSync(outDir).filter((name) => name.endsWith(".diff.json"));
  assert.equal(diffFiles.length, 1);
  const diffJson = JSON.parse(readFileSync(join(outDir, diffFiles[0]), "utf8"));
  const expected = diffModel(buildModel(await parseXml(oldXml)), buildModel(await parseXml(newXml)));
  assert.deepEqual(diffJson, JSON.parse(JSON.stringify(expected)));
});

test("CLI git mode with --changed-only skips untouched flows that match the glob", async () => {
  const repoDir = mkdtempSync(join(tmpdir(), "flow-delta-git-changed-"));
  const outDir = mkdtempSync(join(tmpdir(), "flow-delta-out-"));
  const changedRelPath = "flows/changed.flow-meta.xml";
  const untouchedRelPath = "flows/untouched.flow-meta.xml";
  const changedAbsPath = join(repoDir, changedRelPath);
  const untouchedAbsPath = join(repoDir, untouchedRelPath);
  mkdirSync(dirname(changedAbsPath), { recursive: true });

  writeFileSync(changedAbsPath, SAMPLE_XML, "utf8");
  writeFileSync(untouchedAbsPath, SAMPLE_XML, "utf8");
  git(repoDir, ["init", "-q"]);
  git(repoDir, ["config", "user.email", "codex@example.com"]);
  git(repoDir, ["config", "user.name", "Codex"]);
  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "old"]);
  const oldSha = git(repoDir, ["rev-parse", "HEAD"]);

  writeFileSync(changedAbsPath, SAMPLE_XML.replace("<booleanValue>true</booleanValue>", "<booleanValue>false</booleanValue>"), "utf8");
  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "new"]);
  const newSha = git(repoDir, ["rev-parse", "HEAD"]);

  await main([
    "--from", oldSha,
    "--to", newSha,
    "--repo", repoDir,
    "--path", "flows/*.flow-meta.xml",
    "--changed-only",
    "--out", outDir,
    "--json",
  ]);

  const outputs = readdirSync(outDir).sort();
  assert.equal(outputs.length, 2);
  assert.ok(outputs.some((name) => name.endsWith(".html")));
  assert.ok(outputs.some((name) => name.endsWith(".diff.json")));

  const diffFile = outputs.find((name) => name.endsWith(".diff.json"));
  assert.ok(diffFile);
  const diffJson = JSON.parse(readFileSync(join(outDir, diffFile), "utf8"));
  assert.equal(diffJson.flowName, "TA | Case | InsertAuroraTag");
});

test("CLI git mode discovers deleted files from refs and preserves the old flow name", async () => {
  const repoDir = mkdtempSync(join(tmpdir(), "flow-delta-git-delete-"));
  const outDir = mkdtempSync(join(tmpdir(), "flow-delta-out-"));
  const flowRelPath = "flows/deleted.flow-meta.xml";
  const flowAbsPath = join(repoDir, flowRelPath);
  mkdirSync(dirname(flowAbsPath), { recursive: true });

  writeFileSync(flowAbsPath, SAMPLE_XML, "utf8");
  git(repoDir, ["init", "-q"]);
  git(repoDir, ["config", "user.email", "codex@example.com"]);
  git(repoDir, ["config", "user.name", "Codex"]);
  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "old"]);
  const oldSha = git(repoDir, ["rev-parse", "HEAD"]);

  unlinkSync(flowAbsPath);
  git(repoDir, ["add", "-A"]);
  git(repoDir, ["commit", "-m", "delete"]);
  const newSha = git(repoDir, ["rev-parse", "HEAD"]);

  assert.equal(readdirSync(repoDir).includes("flows"), true);
  await main([
    "--from", oldSha,
    "--to", newSha,
    "--repo", repoDir,
    "--path", "flows/*.flow-meta.xml",
    "--out", outDir,
    "--json",
  ]);

  const outputs = readdirSync(outDir);
  assert.equal(outputs.length, 2);
  const htmlFile = outputs.find((name) => name.endsWith(".html"));
  const diffFile = outputs.find((name) => name.endsWith(".diff.json"));
  assert.ok(htmlFile);
  assert.ok(diffFile);
  assert.ok(!htmlFile!.includes("_unknown_"));
  const diffJson = JSON.parse(readFileSync(join(outDir, diffFile!), "utf8"));
  assert.equal(diffJson.flowName, "TA | Case | InsertAuroraTag");
});

test("CLI file mode writes diff.json and html artifacts", async () => {
  const inputDir = mkdtempSync(join(tmpdir(), "flow-delta-files-"));
  const outDir = mkdtempSync(join(tmpdir(), "flow-delta-out-"));
  const oldPath = join(inputDir, "old.flow-meta.xml");
  const newPath = join(inputDir, "new.flow-meta.xml");
  writeFileSync(oldPath, SAMPLE_XML, "utf8");
  writeFileSync(newPath, SAMPLE_XML.replace("<booleanValue>true</booleanValue>", "<booleanValue>false</booleanValue>"), "utf8");

  const logs: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    await main([
      "--old", oldPath,
      "--new", newPath,
      "--out", outDir,
      "--json",
    ]);
  } finally {
    console.log = originalConsoleLog;
  }

  const files = readdirSync(outDir);
  const diffFiles = files.filter((name) => name.endsWith(".diff.json"));
  const htmlFiles = files.filter((name) => name.endsWith(".html"));
  assert.equal(diffFiles.length, 1);
  assert.equal(htmlFiles.length, 1);
  assert.deepEqual(logs, [
    "TA | Case | InsertAuroraTag: nodes 0 added, 0 deleted, 1 modified; edges 0 added, 0 deleted",
  ]);

  const diffJson = JSON.parse(readFileSync(join(outDir, diffFiles[0]), "utf8"));
  const expected = diffModel(buildModel(await parseXml(SAMPLE_XML)), buildModel(await parseXml(SAMPLE_XML.replace("<booleanValue>true</booleanValue>", "<booleanValue>false</booleanValue>"))));
  assert.deepEqual(diffJson, JSON.parse(JSON.stringify(expected)));
});

test("CLI file mode reports flow-level attribute-only changes", async () => {
  const inputDir = mkdtempSync(join(tmpdir(), "flow-delta-header-files-"));
  const outDir = mkdtempSync(join(tmpdir(), "flow-delta-header-out-"));
  const oldPath = join(inputDir, "old.flow-meta.xml");
  const newPath = join(inputDir, "new.flow-meta.xml");
  writeFileSync(oldPath, SAMPLE_XML, "utf8");
  writeFileSync(newPath, SAMPLE_XML.replace("<status>Active</status>", "<status>Draft</status>"), "utf8");

  const logs: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    await main([
      "--old", oldPath,
      "--new", newPath,
      "--out", outDir,
      "--json",
    ]);
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(logs.length, 1);
  assert.match(logs[0], /flow attributes: 1 changed \(status\)$/);
  const diffFile = readdirSync(outDir).find((name) => name.endsWith(".diff.json"));
  assert.ok(diffFile);
  const diffJson = JSON.parse(readFileSync(join(outDir, diffFile), "utf8"));
  assert.equal(diffJson.summary.modifiedNodes, 0);
  assert.equal(diffJson.summary.changedFlowAttributes, 1);
  assert.deepEqual(diffJson.flowChanges, [{ path: "status", before: "Active", after: "Draft" }]);
});

test("reordering unordered filter arrays does not produce a diff", async () => {
  const original = await parseXml(SAMPLE_XML);
  const reordered = structuredClone(original);
  const filters = reordered.recordLookups?.[0]?.filters;
  assert.ok(filters && filters.length === 2);
  filters.reverse();

  const diff = diffModel(buildModel(original), buildModel(reordered));
  assert.equal(diff.summary.modifiedNodes, 0);
});

// --- Real Salesforce before/after fixtures (fixtures/diff/<name>/) ---------
// Each pair was retrieved from a real org. Summary expectations below were
// captured from the validated CLI output; they regression-lock the diff engine
// against real metadata, not just synthetic mutations. See
// docs/testing.md (scenario matrix).

interface ExpectedSummary {
  addedNodes: number;
  removedNodes: number;
  modifiedNodes: number;
  addedEdges: number;
  removedEdges: number;
  changedFlowAttributes?: number;
}

const DIFF_CASES: Array<{ name: string; expected: ExpectedSummary }> = [
  { name: "noop_save", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, addedEdges: 0, removedEdges: 0 } },
  { name: "add_node", expected: { addedNodes: 1, removedNodes: 0, modifiedNodes: 0, addedEdges: 2, removedEdges: 1 } },
  // Added screen: start retargets to the new screen (1 added node), and because
  // locationX/Y + connectors are stripped from properties, no existing node is
  // marked modified — the rewire shows up purely as edges.
  { name: "add_screen", expected: { addedNodes: 1, removedNodes: 0, modifiedNodes: 0, addedEdges: 2, removedEdges: 1 } },
  { name: "delete_node", expected: { addedNodes: 0, removedNodes: 1, modifiedNodes: 0, addedEdges: 1, removedEdges: 2 } },
  { name: "modify_assignment", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 1, addedEdges: 0, removedEdges: 0 } },
  { name: "modify_decision", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 1, addedEdges: 0, removedEdges: 0 } },
  { name: "rewire_connector", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, addedEdges: 3, removedEdges: 3 } },
  // fault_path bundles two real changes: the fault path (added customError node
  // + fault edge) AND a re-added decision condition. We assert it as-is.
  { name: "fault_path", expected: { addedNodes: 1, removedNodes: 0, modifiedNodes: 1, addedEdges: 2, removedEdges: 0 } },
  { name: "deactivate_flow", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, addedEdges: 0, removedEdges: 0, changedFlowAttributes: 1 } },
  { name: "bump_api_version", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, addedEdges: 0, removedEdges: 0, changedFlowAttributes: 2 } },
];

async function diffFixture(name: string) {
  const dir = join(ROOT, "fixtures", "diff", name);
  const beforeXml = readFileSync(join(dir, "before.flow-meta.xml"), "utf8");
  const afterXml = readFileSync(join(dir, "after.flow-meta.xml"), "utf8");
  const oldModel = buildModel(await parseXml(beforeXml));
  const newModel = buildModel(await parseXml(afterXml));
  oldModel.header = await extractFlowHeader(beforeXml);
  newModel.header = await extractFlowHeader(afterXml);
  return diffModel(oldModel, newModel);
}

function extractData(html: string) {
  const match = html.match(/const DATA = (.*?);\n    const svg =/s);
  assert.ok(match, "expected embedded DATA payload");
  return JSON.parse(match[1]);
}

function extractClientScript(html: string) {
  const match = html.match(/<script>\s*const DATA = ([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(match, "expected embedded client script");
  return `const DATA = ${match[1]}`;
}

function createMockDom(data: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }) {
  const createElement = (options: {
    dataset?: Record<string, string>;
    className?: string;
    isSvg?: boolean;
  } = {}) => {
    const classSet = new Set((options.className ?? "").split(/\s+/).filter(Boolean));
    const listeners: Record<string, Array<() => void>> = {};
    return {
      dataset: { ...(options.dataset ?? {}) },
      style: {} as Record<string, string>,
      attributes: {} as Record<string, string>,
      listeners,
      textContent: "",
      innerHTML: "",
      classList: {
        add: (...tokens: string[]) => tokens.forEach((token) => classSet.add(token)),
        remove: (...tokens: string[]) => tokens.forEach((token) => classSet.delete(token)),
        toggle: (token: string, force?: boolean) => {
          const shouldAdd = force ?? !classSet.has(token);
          if (shouldAdd) classSet.add(token); else classSet.delete(token);
          return shouldAdd;
        },
        contains: (token: string) => classSet.has(token),
      },
      addEventListener(type: string, handler: () => void) {
        (listeners[type] ??= []).push(handler);
      },
      dispatch(type: string) {
        const event = {
          stopPropagation() {},
          preventDefault() {},
          clientX: 0,
          clientY: 0,
          deltaY: 0,
          target: { closest: () => null },
        };
        for (const handler of listeners[type] ?? []) {
          handler(event);
        }
      },
      setAttribute(name: string, value: string) {
        this.attributes[name] = value;
      },
      closest: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      setPointerCapture: () => undefined,
      querySelectorAll: () => [],
      viewBox: options.isSvg ? { baseVal: { x: 0, y: 0, width: 1, height: 1 } } : undefined,
    };
  };

  const nodeElements = new Map(data.nodes.map((node) => [
    node.id,
    createElement({ dataset: { nodeId: node.id }, className: "node" }),
  ]));
  const edgeElements = new Map(data.edges.map((edge) => [
    edge.id,
    createElement({ dataset: { edgeId: edge.id }, className: "edge" }),
  ]));
  const filterButtons = ["all", "after", "before", "changes"].map((viewMode) =>
    createElement({ dataset: { viewMode }, className: "filter-button" }));
  const themeButtons = ["system", "light", "dark"].map((themeChoice) =>
    createElement({ dataset: { themeChoice }, className: "theme-button" }));
  const panel = createElement({ className: "panel" });
  const svg = createElement({ isSvg: true });
  const viewport = createElement();
  const panelTitle = createElement();
  const panelBadge = createElement();
  const panelBody = createElement();
  const documentElement = createElement();
  const localStorageValues: Record<string, string> = {};

  const document = {
    documentElement,
    getElementById(id: string) {
      if (id === "flow-svg") return svg;
      if (id === "viewport") return viewport;
      if (id === "panel-title") return panelTitle;
      if (id === "panel-badge") return panelBadge;
      if (id === "panel-body") return panelBody;
      return null;
    },
    querySelector(selector: string) {
      if (selector === ".panel") return panel;
      if (selector === "#flow-svg") return svg;
      if (selector === "#viewport") return viewport;
      if (selector === "#panel-title") return panelTitle;
      if (selector === "#panel-badge") return panelBadge;
      if (selector === "#panel-body") return panelBody;
      if (selector.startsWith(".node[data-node-id=\"")) {
        const id = selector.slice(".node[data-node-id=\"".length, -2);
        return nodeElements.get(id) ?? null;
      }
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === ".filters button") return filterButtons;
      if (selector === ".theme-toggle button") return themeButtons;
      if (selector === ".node") return [...nodeElements.values()];
      if (selector === ".edge") return [...edgeElements.values()];
      return [];
    },
  };

  const CSS = {
    escape(value: string) {
      return String(value).replace(/"/g, "\\\"");
    },
  };

  return {
    context: {
      document,
      CSS,
      console,
      localStorage: {
        getItem(key: string) {
          return localStorageValues[key] ?? null;
        },
        setItem(key: string, value: string) {
          localStorageValues[key] = value;
        },
      },
    },
    localStorage: { values: localStorageValues },
    elements: { svg, filterButtons, themeButtons, documentElement, nodeById: nodeElements },
  };
}

for (const { name, expected } of DIFF_CASES) {
  test(`diff fixture "${name}" matches expected summary`, async () => {
    const { summary } = await diffFixture(name);
    assert.equal(summary.addedNodes, expected.addedNodes, "addedNodes");
    assert.equal(summary.removedNodes, expected.removedNodes, "removedNodes");
    assert.equal(summary.modifiedNodes, expected.modifiedNodes, "modifiedNodes");
    assert.equal(summary.addedEdges, expected.addedEdges, "addedEdges");
    assert.equal(summary.removedEdges, expected.removedEdges, "removedEdges");
    assert.equal(summary.changedFlowAttributes, expected.changedFlowAttributes ?? 0, "changedFlowAttributes");
  });
}

test('diff fixture "deactivate_flow" reports a header-only deactivation', async () => {
  const diff = await diffFixture("deactivate_flow");
  assert.equal(diff.summary.changedFlowAttributes, 1);
  assert.deepEqual(diff.flowChanges, [{ path: "status", before: "Active", after: "Draft" }]);
  assert.ok(diff.nodes.every((node) => node.status === "unchanged"), "all nodes unchanged");
  assert.ok(diff.edges.every((edge) => edge.status === "unchanged"), "all edges unchanged");
});

test('diff fixture "bump_api_version" reports header-only API/run-mode changes', async () => {
  const diff = await diffFixture("bump_api_version");
  assert.equal(diff.summary.changedFlowAttributes, 2);
  assert.deepEqual(diff.flowChanges?.map((change) => change.path), ["runInMode", "apiVersion"]);
  assert.ok(diff.nodes.every((node) => node.status === "unchanged"), "all nodes unchanged");
  assert.ok(diff.edges.every((edge) => edge.status === "unchanged"), "all edges unchanged");
});

test('diff fixture "noop_save" is a pure no-op (every node and edge unchanged)', async () => {
  const diff = await diffFixture("noop_save");
  assert.ok(diff.nodes.length > 0, "expected the flow to have nodes");
  assert.ok(diff.nodes.every((node) => node.status === "unchanged"), "all nodes unchanged");
  assert.ok(diff.edges.every((edge) => edge.status === "unchanged"), "all edges unchanged");
});

test('diff fixture "modify_decision" reports the exact condition path', async () => {
  const diff = await diffFixture("modify_decision");
  const node = diff.nodes.find((n) => n.id === "Includes_Jawn");
  assert.equal(node?.status, "modified");
  assert.ok(
    node?.changes?.some((c) => c.path === "rules[0].conditions[1]"),
    "expected a delta at rules[0].conditions[1]",
  );
});

test('diff fixture "modify_assignment" reports the assignmentItems path', async () => {
  const diff = await diffFixture("modify_assignment");
  const node = diff.nodes.find((n) => n.id === "Jawn_that_Jawn");
  assert.equal(node?.status, "modified");
  assert.ok(
    node?.changes?.some((c) => c.path === "assignmentItems[1]"),
    "expected a delta at assignmentItems[1]",
  );
});

test('diff fixture "rewire_connector" changes only edges, not nodes', async () => {
  const diff = await diffFixture("rewire_connector");
  assert.ok(diff.nodes.every((node) => node.status === "unchanged"), "all nodes unchanged");
  assert.equal(diff.summary.addedEdges, 3);
  assert.equal(diff.summary.removedEdges, 3);
});

test('rendered "rewire_connector" distinguishes added and deleted edges', async () => {
  const diff = await diffFixture("rewire_connector");
  const html = renderHtml(await layoutDiff(diff));

  assert.equal([...html.matchAll(/class="edge normal added"/g)].length, 3);
  assert.equal([...html.matchAll(/class="edge normal deleted"/g)].length, 3);
  assert.match(html, /data-view-mode="changes"/);
  assert.match(html, /\.edge\.unchanged \{ stroke-width: 1\.4; opacity: 0\.55; \}/);
  assert.match(html, /\.edge\.added \{ stroke: var\(--added\); stroke-width: 3; marker-end: url\(#arrow-added\); \}/);
  assert.match(html, /\.edge\.deleted \{ stroke: var\(--deleted\); stroke-width: 2; stroke-dasharray: 7 5; marker-end: url\(#arrow-deleted\); \}/);
});

test('diff fixture "fault_path" adds a kind=fault edge into the error node', async () => {
  const diff = await diffFixture("fault_path");
  assert.ok(
    diff.nodes.some((n) => n.id === "Error_on_Get_Children" && n.status === "added"),
    "expected the custom error node to be added",
  );
  const faultEdge = diff.edges.find((e) => e.kind === "fault" && e.status === "added");
  assert.ok(faultEdge, "expected an added fault edge");
  assert.equal(faultEdge?.target, "Error_on_Get_Children");
});

async function parseXml(xml: string) {
  return new FlowParser(xml).generateFlowDefinition();
}

function git(repoDir: string, args: string[]): string {
  return execFileSync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Codex",
      GIT_AUTHOR_EMAIL: "codex@example.com",
      GIT_COMMITTER_NAME: "Codex",
      GIT_COMMITTER_EMAIL: "codex@example.com",
    },
  }).trim();
}
