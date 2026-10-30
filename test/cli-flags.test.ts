import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { main as flowMain } from "../src/cli.ts";
import { main as flexipageMain } from "../src/flexipage-cli.ts";
import { main as flowGitLabMain } from "../src/ci/gitlab-report.ts";
import { main as flowGitHubMain } from "../src/ci/github-report.ts";
import { main as flexipageGitLabMain } from "../src/ci/flexipage-gitlab-report.ts";
import { main as flexipageGitHubMain } from "../src/ci/flexipage-github-report.ts";

const version = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile("package.json", "utf8")))
  .version as string;
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const bins = [
  ["flow-delta", flowMain],
  ["flexipage-delta", flexipageMain],
  ["flow-delta-gitlab", flowGitLabMain],
  ["flow-delta-github", flowGitHubMain],
  ["flexipage-delta-gitlab", flexipageGitLabMain],
  ["flexipage-delta-github", flexipageGitHubMain],
] as const;

test("each CLI prints its package version without creating output", async () => {
  const originalCwd = process.cwd();
  const cwd = mkdtempSync(join(tmpdir(), "flow-delta-cli-version-"));
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (line?: unknown) => lines.push(String(line ?? ""));

  try {
    process.chdir(cwd);
    for (const [bin, main] of bins) {
      lines.length = 0;
      await main(["--version"]);
      assert.deepEqual(lines, [`${bin} ${version}`]);
      lines.length = 0;
      await main(["--bogus", "--version"]);
      assert.deepEqual(lines, [`${bin} ${version}`]);
    }
    assert.equal(existsSync(join(cwd, "flow-delta-out")), false);
    assert.equal(existsSync(join(cwd, "flexipage-delta-out")), false);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("main CLIs report unknown options without throwing or printing a stack", async () => {
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  const errors: string[] = [];
  console.error = (line?: unknown) => errors.push(String(line ?? ""));

  try {
    for (const [bin, main] of [
      ["flow-delta", flowMain],
      ["flexipage-delta", flexipageMain],
    ] as const) {
      errors.length = 0;
      process.exitCode = 0;
      await assert.doesNotReject(main(["--bogus"]));
      assert.equal(process.exitCode, 1);
      assert.match(errors.join("\n"), new RegExp(`Run ${bin} --help for usage\\.`));
      assert.doesNotMatch(errors.join("\n"), /\bat\s+.*\(.*:\d+:\d+\)/);
    }
  } finally {
    console.error = originalError;
    process.exitCode = originalExitCode;
  }
});

test("built CLIs print their package version", { skip: !existsSync("dist/cli.js") }, () => {
  const distBins = [
    ["flow-delta", "cli.js"],
    ["flexipage-delta", "flexipage-cli.js"],
    ["flow-delta-gitlab", "gitlab-report.js"],
    ["flow-delta-github", "github-report.js"],
    ["flexipage-delta-gitlab", "flexipage-gitlab-report.js"],
    ["flexipage-delta-github", "flexipage-github-report.js"],
  ];
  for (const [bin, file] of distBins) {
    const result = spawnSync(process.execPath, [join(repoRoot, "dist", file), "--version"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${bin} ${version}\n`, `${bin} output: ${JSON.stringify(result)}`);
    assert.equal(result.stderr, "");
  }
});
