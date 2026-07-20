import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { safeFileName } from "../src/util/file-name.ts";

export interface FixturePair {
  name: string;
  before: string;
  after: string;
}

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REPO_DIR = resolve(ROOT, "sample-project");
export const SMOKE_TARBALL_NAME = "flow-delta.tgz";

export function collectFixturePairs(root: string): FixturePair[] {
  return collectMetadataFixturePairs(root, "before.flow-meta.xml", "after.flow-meta.xml");
}

export function collectFlexiPageFixturePairs(root: string, namePrefix: string): FixturePair[] {
  return collectMetadataFixturePairs(root, "before.flexipage-meta.xml", "after.flexipage-meta.xml")
    .map((fixture) => ({ ...fixture, name: `${namePrefix}-${fixture.name}` }));
}

function collectMetadataFixturePairs(root: string, beforeName: string, afterName: string): FixturePair[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const fixtureDir = join(root, name);
      const before = join(fixtureDir, beforeName);
      const after = join(fixtureDir, afterName);
      if (!existsSync(before) || !existsSync(after)) {
        throw new Error(`Fixture pair is incomplete: ${name}`);
      }
      return {
        name,
        before: readFileSync(before, "utf8"),
        after: readFileSync(after, "utf8"),
      };
    });
}

export function prepareRepoScaffold(repoDir: string): void {
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(join(repoDir, "force-app", "main", "default", "flows"), { recursive: true });
  mkdirSync(join(repoDir, "force-app", "main", "default", "flexipages"), { recursive: true });
}

export function buildAndPackLocal(root: string): string {
  runNpm(["run", "build"], { cwd: root, stdio: "inherit" });
  const dest = mkdtempSync(join(tmpdir(), "flow-delta-pack-"));
  const output = String(runNpm(["pack", "--pack-destination", dest], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })).trim();
  const file = output.split("\n").map((line) => line.trim()).filter(Boolean).pop();
  if (!file) {
    throw new Error("npm pack did not report a tarball name");
  }
  return join(dest, file);
}

export function resolveNpmCommand(platform = process.platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function resolveNpmInvocation(env = process.env, platform = process.platform): { command: string; prefixArgs: string[] } {
  if (env.npm_execpath) {
    return { command: process.execPath, prefixArgs: [env.npm_execpath] };
  }
  return { command: resolveNpmCommand(platform), prefixArgs: [] };
}

function runNpm(
  args: string[],
  options: Parameters<typeof execFileSync>[2],
): Buffer | string {
  const invocation = resolveNpmInvocation();
  return execFileSync(invocation.command, [...invocation.prefixArgs, ...args], options);
}

export function buildRepoGitIgnore(): string {
  const sourcePath = join(ROOT, "sample-project", ".gitignore");
  const raw = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";
  const cleaned = raw
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "# FlowDelta smoke output"
        && trimmed !== "flow-delta-out/"
        && trimmed !== "flexipage-delta-out/";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return [cleaned, "", "# FlowDelta smoke output", "flow-delta-out/", "flexipage-delta-out/"].join("\n");
}

export function ensureGitRepo(repoDir: string, baseBranch: string): void {
  if (!existsSync(join(repoDir, ".git"))) {
    execFileSync("git", ["-C", repoDir, "init", "-b", baseBranch], { stdio: "inherit" });
  }

  execFileSync("git", ["-C", repoDir, "config", "user.name", "FlowDelta Smoke"], { stdio: "inherit" });
  execFileSync("git", ["-C", repoDir, "config", "user.email", "flowdelta-smoke@example.com"], { stdio: "inherit" });
  checkoutOrCreateBranch(repoDir, baseBranch);
}

export function ensureRemote(repoDir: string, remote: string, remoteUrl?: string): void {
  if (!remoteUrl) {
    return;
  }

  const remotes = execFileSync("git", ["-C", repoDir, "remote"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (remotes.includes(remote)) {
    execFileSync("git", ["-C", repoDir, "remote", "set-url", remote, remoteUrl], { stdio: "inherit" });
    return;
  }

  execFileSync("git", ["-C", repoDir, "remote", "add", remote, remoteUrl], { stdio: "inherit" });
}

export function checkoutBranch(repoDir: string, branch: string): void {
  execFileSync("git", ["-C", repoDir, "switch", branch], { stdio: "inherit" });
}

export function checkoutOrCreateBranch(repoDir: string, branch: string): void {
  if (branchExists(repoDir, branch)) {
    checkoutBranch(repoDir, branch);
    return;
  }
  execFileSync("git", ["-C", repoDir, "switch", "-c", branch], { stdio: "inherit" });
}

function branchExists(repoDir: string, branch: string): boolean {
  const result = execFileSync("git", ["-C", repoDir, "branch", "--list", branch], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.trim().length > 0;
}

export function createBranch(repoDir: string, branch: string): void {
  execFileSync("git", ["-C", repoDir, "switch", "-c", branch], { stdio: "inherit" });
}

export function cleanFlowDirectory(flowDir: string): void {
  cleanMetadataDirectory(flowDir, ".flow-meta.xml");
}

export function cleanFlexiPageDirectory(flexiPageDir: string): void {
  cleanMetadataDirectory(flexiPageDir, ".flexipage-meta.xml");
}

function cleanMetadataDirectory(directory: string, suffix: string): void {
  mkdirSync(directory, { recursive: true });
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(suffix)) {
      rmSync(join(directory, entry.name));
    }
  }
}

export function writeFixtureFiles(flowDir: string, fixtures: FixturePair[], phase: "before" | "after"): void {
  fixtures.forEach((fixture, index) => {
    const flowName = safeFileName(`smoke-${String(index + 1).padStart(2, "0")}-${fixture.name}`);
    const xml = phase === "before" ? fixture.before : fixture.after;
    const rewritten = renameFlowMetadata(xml, flowName);
    writeText(join(flowDir, `${flowName}.flow-meta.xml`), rewritten);
  });
}

export function writeFlexiPageFixtureFiles(flexiPageDir: string, fixtures: FixturePair[], phase: "before" | "after"): void {
  fixtures.forEach((fixture, index) => {
    const pageName = safeFileName(`smoke-${String(index + 1).padStart(2, "0")}-${fixture.name}`);
    const xml = phase === "before" ? fixture.before : fixture.after;
    const rewritten = renameFlexiPageMetadata(xml, pageName);
    writeText(join(flexiPageDir, `${pageName}.flexipage-meta.xml`), rewritten);
  });
}

export function renameFlowMetadata(xml: string, nextName: string): string {
  const labelMatch = findShallowTag(xml, "label");
  if (!labelMatch) {
    throw new Error("Could not find top-level <label> in flow XML");
  }

  const { indentation, value: currentName } = labelMatch;
  const interviewPattern = tagPattern("interviewLabel", indentation);
  const labelPattern = tagPattern("label", indentation);
  return xml
    .replace(interviewPattern, (_match, interviewIndentation: string, interviewLabel: string) => {
      const nextInterviewLabel = interviewLabel.includes(currentName)
        ? interviewLabel.replace(currentName, nextName)
        : `${nextName} {!$Flow.CurrentDateTime}`;
      return `${interviewIndentation}<interviewLabel>${nextInterviewLabel}</interviewLabel>`;
    })
    .replace(labelPattern, `${indentation}<label>${nextName}</label>`);
}

export function renameFlexiPageMetadata(xml: string, nextName: string): string {
  const masterLabelMatch = findShallowTag(xml, "masterLabel");
  if (!masterLabelMatch) {
    throw new Error("Could not find top-level <masterLabel> in FlexiPage XML");
  }

  const masterLabelPattern = tagPattern("masterLabel", escapeRegExp(masterLabelMatch.indentation), "gm");
  return xml.replace(masterLabelPattern, `${masterLabelMatch.indentation}<masterLabel>${nextName}</masterLabel>`);
}

function findShallowTag(xml: string, tagName: string): { indentation: string; value: string } | undefined {
  const matches = [...xml.matchAll(tagPattern(tagName, "[ \\t]+", "gm"))];
  if (matches.length === 0) {
    return undefined;
  }
  const shallowest = matches.reduce((best, current) => (current[1].length < best[1].length ? current : best));
  return { indentation: shallowest[1], value: shallowest[2] };
}

function tagPattern(tagName: string, indentation = "[ \\t]+", flags = "m"): RegExp {
  return new RegExp(`^(${indentation})<${tagName}>([^<]+)<\\/${tagName}>`, flags);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

export function stageAndCommit(repoDir: string, message: string): void {
  execFileSync("git", ["-C", repoDir, "add", "-A"], { stdio: "inherit" });
  const status = execFileSync("git", ["-C", repoDir, "status", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (status.trim().length === 0) {
    console.log(`Nothing to commit for "${message}"; skipping.`);
    return;
  }
  execFileSync("git", ["-C", repoDir, "commit", "-m", message], { stdio: "inherit" });
}

export function pushBranch(repoDir: string, remote: string, branch: string): void {
  execFileSync("git", ["-C", repoDir, "push", "-u", remote, branch], { stdio: "inherit" });
}

export function timestamp(): string {
  const now = new Date();
  const parts = [
    now.getUTCFullYear().toString(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
    String(now.getUTCMilliseconds()).padStart(3, "0"),
  ];
  return parts.join("");
}

export function stringValue(value: string | boolean | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

export function stringValueOptional(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function writeText(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
}
