import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildRepoGitIgnore, checkoutOrCreateBranch, collectFlexiPageFixturePairs, renameFlexiPageMetadata, renameFlowMetadata, resolveNpmCommand, resolveNpmInvocation } from "../scripts/smoke-common.ts";

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

test("renameFlowMetadata handles top-level labels when interviewLabel is absent", () => {
  const xml = readFileSync(join(process.cwd(), "fixtures", "diff", "bump_api_version", "after.flow-meta.xml"), "utf8");

  const renamed = renameFlowMetadata(xml, "smoke-03-bump_api_version");

  assert.match(renamed, /<label>smoke-03-bump_api_version<\/label>/);
  assert.match(renamed, /<label>Populate Tag<\/label>/);
  assert.match(renamed, /<label>Insert Tag<\/label>/);
  assert.doesNotMatch(renamed, /<interviewLabel>/);
});

test("FlexiPage smoke fixtures include semantic and template pairs", () => {
  const semantic = collectFlexiPageFixturePairs(join(process.cwd(), "fixtures", "flexipage-diff"), "diff");
  const templates = collectFlexiPageFixturePairs(join(process.cwd(), "fixtures", "flexipage-template"), "template");

  assert.ok(semantic.length > 0);
  assert.ok(templates.length > 0);
  assert.ok(semantic.every((fixture) => fixture.name.startsWith("diff-")));
  assert.ok(templates.every((fixture) => fixture.name.startsWith("template-")));
});

test("renameFlexiPageMetadata changes only the top-level page label", () => {
  const xml = readFileSync(join(process.cwd(), "fixtures", "flexipage-template", "recordHomeTemplateDesktop", "after.flexipage-meta.xml"), "utf8");

  const renamed = renameFlexiPageMetadata(xml, "smoke-template-record-home");

  assert.match(renamed, /<masterLabel>smoke-template-record-home<\/masterLabel>/);
  assert.match(renamed, /<name>flexipage:recordHomeTemplateDesktop<\/name>/);
});

test("resolveNpmCommand uses the Windows command shim", () => {
  assert.equal(resolveNpmCommand("win32"), "npm.cmd");
  assert.equal(resolveNpmCommand("linux"), "npm");
});

test("resolveNpmInvocation prefers npm_execpath to avoid Windows cmd shim spawning", () => {
  const invocation = resolveNpmInvocation({ npm_execpath: "C:\\node\\npm-cli.js" } as NodeJS.ProcessEnv, "win32");

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.prefixArgs, ["C:\\node\\npm-cli.js"]);
  assert.deepEqual(resolveNpmInvocation({} as NodeJS.ProcessEnv, "linux"), { command: "npm", prefixArgs: [] });
});

test("checkoutOrCreateBranch creates the requested branch when it is missing", () => {
  const repoDir = mkdtempSync(join(tmpdir(), "flow-delta-smoke-git-"));
  execFileSync("git", ["-C", repoDir, "init", "-b", "master"], { stdio: "ignore" });

  checkoutOrCreateBranch(repoDir, "main");

  const branch = execFileSync("git", ["-C", repoDir, "branch", "--show-current"], { encoding: "utf8" }).trim();
  assert.equal(branch, "main");
});

test("buildRepoGitIgnore works when the sample ignore template is absent", () => {
  const ignore = buildRepoGitIgnore();

  assert.match(ignore, /# FlowDelta smoke output/);
  assert.match(ignore, /flow-delta-out\//);
  assert.match(ignore, /flexipage-delta-out\//);
});
