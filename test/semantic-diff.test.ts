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
import { deepDiff } from "../src/diff/deep-diff.ts";
import { diffModel } from "../src/diff/diff-model.ts";
import { layoutDiff } from "../src/render/layout.ts";
import { renderHtml } from "../src/render/render-html.ts";
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
  assert.match(html, /class="node unchanged"/);
  assert.match(html, /class="legend"/);
  assert.match(html, /data-view-mode="all"/);
  assert.match(html, /data-view-mode="after"/);
  assert.match(html, /data-view-mode="before"/);
  assert.match(html, /data-view-mode="changes"/);
  assert.match(html, /function applyView\(mode\)/);
  assert.match(html, /function round\(value\)/);
  assert.match(html, /function measureVisibleBounds\(nodes, edges\)/);
  assert.match(html, /function fitViewBoxRect\(bounds\)/);
  assert.match(html, /const DATA = /);
  assert.match(html, /if \(event\.target\.closest\("\.node"\)\) return;/);
  assert.ok(!html.includes("activeView"));
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\) clamp\(360px, 32vw, 520px\)/);
  assert.match(html, /beforeMissing \? "Added"/);
  assert.match(html, /Metadata path:/);
  assert.match(html, /Not present/);
  assert.ok(!html.includes("http://"));
  assert.ok(!html.includes("https://"));
  for (const node of layout.nodes) {
    assert.ok(html.includes(node.id));
  }
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
}

const DIFF_CASES: Array<{ name: string; expected: ExpectedSummary }> = [
  { name: "noop_save", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, addedEdges: 0, removedEdges: 0 } },
  { name: "add_node", expected: { addedNodes: 1, removedNodes: 0, modifiedNodes: 0, addedEdges: 2, removedEdges: 1 } },
  { name: "modify_assignment", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 1, addedEdges: 0, removedEdges: 0 } },
  { name: "modify_decision", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 1, addedEdges: 0, removedEdges: 0 } },
  { name: "rewire_connector", expected: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, addedEdges: 3, removedEdges: 3 } },
  // fault_path bundles two real changes: the fault path (added customError node
  // + fault edge) AND a re-added decision condition. We assert it as-is.
  { name: "fault_path", expected: { addedNodes: 1, removedNodes: 0, modifiedNodes: 1, addedEdges: 2, removedEdges: 0 } },
];

async function diffFixture(name: string) {
  const dir = join(ROOT, "fixtures", "diff", name);
  const oldModel = buildModel(await parseXml(readFileSync(join(dir, "before.flow-meta.xml"), "utf8")));
  const newModel = buildModel(await parseXml(readFileSync(join(dir, "after.flow-meta.xml"), "utf8")));
  return diffModel(oldModel, newModel);
}

function extractData(html: string) {
  const match = html.match(/const DATA = (.*?);\n    const svg =/s);
  assert.ok(match, "expected embedded DATA payload");
  return JSON.parse(match[1]);
}

function extractClientScript(html: string) {
  const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(match, "expected embedded client script");
  return match[1];
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
        for (const handler of listeners[type] ?? []) {
          handler();
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
  const panel = createElement({ className: "panel" });
  const svg = createElement({ isSvg: true });
  const viewport = createElement();
  const panelTitle = createElement();
  const panelBadge = createElement();
  const panelBody = createElement();

  const document = {
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
    context: { document, CSS, console },
    elements: { svg, filterButtons, nodeById: nodeElements },
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
  });
}

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
