import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSmokeWorkflow } from "../scripts/smoke-github.ts";

test("GitHub smoke script invokes main when run through tsx", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "scripts/smoke-github.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(output, /npm run smoke:github/);
});

test("GitHub smoke workflow runs and reports both metadata products", () => {
  const workflow = buildSmokeWorkflow("flow-delta.tgz");

  assert.match(workflow, /\.\/node_modules\/\.bin\/flow-delta/);
  assert.match(workflow, /--path 'force-app\/\*\*\/\*\.flow-meta\.xml'/);
  assert.match(workflow, /--out flow-delta-out --json/);
  assert.match(workflow, /\.\/node_modules\/\.bin\/flexipage-delta/);
  assert.match(workflow, /--path 'force-app\/\*\*\/\*\.flexipage-meta\.xml'/);
  assert.match(workflow, /--out flexipage-delta-out --json/);

  assert.match(workflow, /name: flow-delta-out[\s\S]*path: flow-delta-out/);
  assert.match(workflow, /name: flexipage-delta-out[\s\S]*path: flexipage-delta-out/);
  assert.match(workflow, /r2-publish\.mjs flow-delta-out/);
  assert.match(workflow, /r2-publish\.mjs flexipage-delta-out/);
  assert.match(workflow, /flow-delta-github --in flow-delta-out --artifact-urls flow-delta-out\/urls\.json/);
  assert.match(workflow, /flexipage-delta-github --in flexipage-delta-out --artifact-urls flexipage-delta-out\/urls\.json/);
});
