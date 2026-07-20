import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildComment,
  findStickyNote,
  isZeroSummary,
  loadArtifactUrls,
  resolveArtifactUrl,
  type FlowResult,
} from "../src/ci/report-core.ts";

test("buildComment renders a marker, table, escaped flow names, and commit footer", () => {
  const results: FlowResult[] = [
    {
      flowName: "TA | Case | InsertAuroraTag",
      summary: { addedNodes: 1, removedNodes: 0, modifiedNodes: 2, addedEdges: 3, removedEdges: 4, changedFlowAttributes: 0 },
      artifactUrl: "https://example.test/one",
    },
    {
      flowName: "Another Flow",
      summary: { addedNodes: 0, removedNodes: 1, modifiedNodes: 0, addedEdges: 0, removedEdges: 1, changedFlowAttributes: 0 },
      artifactUrl: "https://example.test/two",
    },
  ];

  const comment = buildComment(results, { commitSha: "abcdef1234567890" });

  assert.match(comment, /^<!-- FlowDelta:report -->/);
  assert.match(comment, /## 🔍 FlowDelta — 2 flows changed/);
  assert.match(comment, /\| Flow \| Nodes \(\+\/-\/~\) \| Edges \(\+\/-\) \| Flow Attributes \(\+\/-\/~\) \| Diff \|/);
  assert.match(comment, /TA \\| Case \\| InsertAuroraTag \| \+1 \/ −0 \/ ~2 \| \+3 \/ −4 \| \+0 \/ −0 \/ ~0 \| \[View\]\(https:\/\/example\.test\/one\) \|/);
  assert.match(comment, /Another Flow \| \+0 \/ −1 \/ ~0 \| \+0 \/ −1 \| \+0 \/ −0 \/ ~0 \| \[View\]\(https:\/\/example\.test\/two\) \|/);
  assert.match(comment, /Commit: `abcdef1`/);
});

test("buildComment renders the empty-state message when there are no changed flows", () => {
  const comment = buildComment([]);
  assert.match(comment, /No Flow changes in this MR/);
});

test("buildComment shows a Flow Attributes count when nodes and edges are unchanged", () => {
  const comment = buildComment([
    {
      flowName: "Header Only",
      summary: { addedNodes: 0, removedNodes: 0, modifiedNodes: 0, addedEdges: 0, removedEdges: 0, changedFlowAttributes: 1 },
      flowChanges: [{ path: "status", before: "Active", after: "Draft" }],
      artifactUrl: "https://example.test/header",
    },
  ]);

  assert.match(comment, /Header Only \| \+0 \/ −0 \/ ~0 \| \+0 \/ −0 \| \+0 \/ −0 \/ ~1 \| \[View\]\(https:\/\/example\.test\/header\) \|/);
});

test("buildComment defaults the Flow Attributes count to 0 when there are no flow-level changes", () => {
  const comment = buildComment([
    {
      flowName: "Nodes Only",
      summary: { addedNodes: 1, removedNodes: 0, modifiedNodes: 0, addedEdges: 0, removedEdges: 0, changedFlowAttributes: 0 },
      artifactUrl: "https://example.test/nodes-only",
    },
  ]);

  assert.match(comment, /Nodes Only \| \+1 \/ −0 \/ ~0 \| \+0 \/ −0 \| \+0 \/ −0 \/ ~0 \| \[View\]\(https:\/\/example\.test\/nodes-only\) \|/);
});

test("isZeroSummary treats flow-level attributes as changes", () => {
  assert.equal(isZeroSummary({
    addedNodes: 0,
    removedNodes: 0,
    modifiedNodes: 0,
    unchangedNodes: 3,
    addedEdges: 0,
    removedEdges: 0,
    changedFlowAttributes: 1,
  }), false);
});

test("loadArtifactUrls and resolveArtifactUrl use manifest URLs with fallback", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-delta-urls-"));
  const manifest = join(dir, "urls.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      "Test_Flow.html": "https://artifacts.example/Test_Flow.html",
      "Other_Flow.html": "javascript:alert(1)",
      "Bad_Flow.html": 42,
    }),
    "utf8",
  );

  const urls = loadArtifactUrls(manifest);

  assert.deepEqual(loadArtifactUrls(), {});
  assert.deepEqual(loadArtifactUrls(join(dir, "missing.json")), {});
  assert.equal(resolveArtifactUrl("Test_Flow", urls, "https://github.example/run"), "https://artifacts.example/Test_Flow.html");
  assert.equal(resolveArtifactUrl("Other_Flow", urls, "https://github.example/run"), "https://github.example/run");
  assert.equal(resolveArtifactUrl("Bad_Flow", urls, "https://github.example/run"), "https://github.example/run");
});

test("loadArtifactUrls falls back to an empty manifest for empty or malformed input", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-delta-bad-urls-"));
  const emptyManifest = join(dir, "empty.json");
  const malformedManifest = join(dir, "malformed.json");
  const arrayManifest = join(dir, "array.json");
  writeFileSync(emptyManifest, "", "utf8");
  writeFileSync(malformedManifest, "{", "utf8");
  writeFileSync(arrayManifest, "[]", "utf8");

  assert.deepEqual(loadArtifactUrls(emptyManifest), {});
  assert.deepEqual(loadArtifactUrls(malformedManifest), {});
  assert.deepEqual(loadArtifactUrls(arrayManifest), {});
});

test("findStickyNote matches marker notes only for the current author", () => {
  const notes = [
    { id: 1, body: "<!-- FlowDelta:report -->\nold", author: { id: 99 } },
    { id: 2, body: "<!-- FlowDelta:report -->\nother", author: { id: 10 } },
    { id: 3, body: "noise", author: { id: 99 } },
  ];

  assert.equal(findStickyNote(notes, "<!-- FlowDelta:report -->", 10)?.id, 2);
  assert.equal(findStickyNote(notes, "<!-- FlowDelta:report -->", 99)?.id, 1);
  assert.equal(findStickyNote(notes, "<!-- FlowDelta:report -->", 123), undefined);
});

test("findStickyNote matches by marker only when no author id is given", () => {
  const notes = [
    { id: 1, body: "noise" },
    { id: 2, body: "<!-- FlowDelta:report -->\nold" },
  ];

  assert.equal(findStickyNote(notes, "<!-- FlowDelta:report -->")?.id, 2);
});

test("package metadata keeps the published bins and build artifacts aligned", async () => {
  await import(pathToFileURL(join(process.cwd(), "scripts/build.mjs")).href);

  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    bin?: Record<string, string>;
    files?: string[];
  };
  assert.deepEqual(packageJson.bin, {
    "flow-delta": "dist/cli.js",
    "flow-delta-gitlab": "dist/gitlab-report.js",
    "flow-delta-github": "dist/github-report.js",
    "flexipage-delta": "dist/flexipage-cli.js",
    "flexipage-delta-gitlab": "dist/flexipage-gitlab-report.js",
    "flexipage-delta-github": "dist/flexipage-github-report.js",
  });
  assert.ok(packageJson.files?.includes("dist"));
  assert.ok(packageJson.files?.includes("NOTICE"));
  assert.ok(packageJson.files?.includes("LICENSE"));
  assert.ok(packageJson.files?.includes("LICENSE-APACHE"));

  const cliBundle = readFileSync(join(process.cwd(), "dist", "cli.js"), "utf8");
  const gitlabBundle = readFileSync(join(process.cwd(), "dist", "gitlab-report.js"), "utf8");
  const githubBundle = readFileSync(join(process.cwd(), "dist", "github-report.js"), "utf8");
  assert.ok(cliBundle.startsWith("#!/usr/bin/env node"));
  assert.ok(gitlabBundle.startsWith("#!/usr/bin/env node"));
  assert.ok(githubBundle.startsWith("#!/usr/bin/env node"));

  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    const { main: cliMain } = await import(pathToFileURL(join(process.cwd(), "dist", "cli.js")).href);
    const { main: gitlabMain } = await import(pathToFileURL(join(process.cwd(), "dist", "gitlab-report.js")).href);
    const { main: githubMain } = await import(pathToFileURL(join(process.cwd(), "dist", "github-report.js")).href);
    await cliMain(["--help"]);
    await gitlabMain(["--help"]);
    await githubMain(["--help"]);
  } finally {
    console.log = originalLog;
  }

  assert.ok(logs.some((line) => line.includes("flow-delta --old")));
  assert.ok(logs.some((line) => line.includes("flow-delta-gitlab --in")));
  assert.ok(logs.some((line) => line.includes("flow-delta-github --in")));
});

test("published bins execute through npm-style symlinks", async () => {
  await import(pathToFileURL(join(process.cwd(), "scripts/build.mjs")).href);

  const binDir = mkdtempSync(join(tmpdir(), "flow-delta-bin-"));
  const cliBin = join(binDir, "flow-delta");
  const gitlabBin = join(binDir, "flow-delta-gitlab");
  const githubBin = join(binDir, "flow-delta-github");
  linkBin(join(process.cwd(), "dist", "cli.js"), cliBin);
  linkBin(join(process.cwd(), "dist", "gitlab-report.js"), gitlabBin);
  linkBin(join(process.cwd(), "dist", "github-report.js"), githubBin);

  assert.match(execFileSync(process.execPath, [cliBin, "--help"], { encoding: "utf8" }), /flow-delta --old/);
  assert.match(execFileSync(process.execPath, [gitlabBin, "--help"], { encoding: "utf8" }), /flow-delta-gitlab --in/);
  assert.match(execFileSync(process.execPath, [githubBin, "--help"], { encoding: "utf8" }), /flow-delta-github --in/);
});

function linkBin(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath, "file");
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || (code !== "EPERM" && code !== "EACCES")) {
      throw error;
    }
  }

  writeFileSync(
    linkPath,
    `#!/usr/bin/env node\nimport { main } from ${JSON.stringify(pathToFileURL(target).href)};\nvoid main();\n`,
    "utf8",
  );
}
