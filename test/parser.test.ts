import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowParser } from "../src/parser/flow_parser.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "fixtures", "parse");

test("FlowParser parses the checked-in fixtures", async () => {
  const files = readdirSync(FIXTURES).filter((name) => name.endsWith(".flow-meta.xml")).sort();
  for (const file of files) {
    const xml = readFileSync(join(FIXTURES, file), "utf8");
    const parser = new FlowParser(xml);
    if (file === "no_start_node.flow-meta.xml" || file === "missing_transition_node.flow-meta.xml") {
      await assert.rejects(() => parser.generateFlowDefinition());
      continue;
    }
    const parsed = await parser.generateFlowDefinition();
    assert.ok(parsed);
    assert.ok(parsed.nameToNode);
  }
});

test("sample flow exposes the expected transitions", async () => {
  const xml = readFileSync(join(FIXTURES, "sample.flow-meta.xml"), "utf8");
  const parsed = await new FlowParser(xml).generateFlowDefinition();
  assert.deepEqual(parsed.transitions, [
    {
      from: "FLOW_START",
      to: "Get_Aurora_Tag_Definition",
      fault: false,
      label: undefined,
    },
    {
      from: "Get_Aurora_Tag_Definition",
      to: "Was_Tag_Definition_c_found",
      fault: false,
      label: undefined,
    },
    {
      from: "Was_Tag_Definition_c_found",
      to: "Populate_Tag",
      fault: false,
      label: "Yes",
    },
    {
      from: "Was_Tag_Definition_c_found",
      to: "Add_No_Tag_Definition_Found_Error",
      fault: false,
      label: "No",
    },
    {
      from: "Populate_Tag",
      to: "Insert_Tag",
      fault: false,
      label: undefined,
    },
    {
      from: "Insert_Tag",
      to: "Add_Issue_Inserting_Tag_Record_Error",
      fault: true,
      label: "Fault",
    },
  ]);
});

test("circular transitions are preserved", async () => {
  const xml = readFileSync(join(FIXTURES, "circular_transition.flow-meta.xml"), "utf8");
  const parsed = await new FlowParser(xml).generateFlowDefinition();
  assert.deepEqual(parsed.transitions, [
    {
      from: "FLOW_START",
      to: "myLoop",
      fault: false,
      label: undefined,
    },
    {
      from: "myLoop",
      to: "myLoop",
      fault: false,
      label: "for each",
    },
  ]);
});
