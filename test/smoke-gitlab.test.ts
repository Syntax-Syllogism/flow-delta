import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renameFlowMetadata } from "../scripts/smoke-gitlab.ts";

test("renameFlowMetadata changes only the Flow identity labels", () => {
  const xml = readFileSync(join(process.cwd(), "fixtures", "diff", "add_node", "after.flow-meta.xml"), "utf8");

  const renamed = renameFlowMetadata(xml, "smoke-01-add_node");

  assert.match(renamed, /<interviewLabel>smoke-01-add_node \{!\$Flow\.CurrentDateTime\}<\/interviewLabel>/);
  assert.match(renamed, /<label>smoke-01-add_node<\/label>/);
  assert.match(renamed, /<label>Includes Jawn<\/label>/);
  assert.match(renamed, /<label>Yes<\/label>/);
  assert.match(renamed, /<label>Jawnify<\/label>/);
  assert.doesNotMatch(renamed, /<decisions>\s*<name>Includes_Jawn<\/name>\s*<label>smoke-01-add_node<\/label>/);
});
