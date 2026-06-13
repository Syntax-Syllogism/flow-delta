import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { safeFileName } from "../src/util/file-name.ts";

interface SmokeOptions {
  repoDir: string;
  remote: string;
  remoteUrl?: string;
  baseBranch: string;
  branchPrefix: string;
  titlePrefix: string;
}

interface FixturePair {
  name: string;
  before: string;
  after: string;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPO_DIR = resolve(ROOT, "sample-project");
const DEFAULT_BASE_BRANCH = "master";
const DEFAULT_BRANCH_PREFIX = "flow-delta-smoke/e2e";
const DEFAULT_TITLE_PREFIX = "FlowDelta smoke/e2e";
// The smoke pipeline installs THIS file (built from the current source) instead
// of the published npm package, so the MR exercises the latest local code.
const SMOKE_TARBALL_NAME = "flow-delta.tgz";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        "repo-dir": { type: "string" },
        remote: { type: "string" },
        "remote-url": { type: "string" },
        "base-branch": { type: "string" },
        "branch-prefix": { type: "string" },
        "title-prefix": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    });

    if (parsed.values.help) {
      printUsage();
      return;
    }

    const options = resolveOptions(parsed.values);
    const fixtures = collectFixturePairs(join(ROOT, "fixtures", "diff"));
    if (fixtures.length === 0) {
      throw new Error("No fixture pairs found under fixtures/diff");
    }

    // Build + pack the current source so the pipeline renders with the latest
    // local code, not the last published release.
    const tarballPath = buildAndPackLocal(ROOT);

    prepareRepoScaffold(options.repoDir);
    copyFileSync(tarballPath, join(options.repoDir, SMOKE_TARBALL_NAME));
    ensureGitRepo(options.repoDir, options.baseBranch);
    ensureRemote(options.repoDir, options.remote, options.remoteUrl);

    const smokeRunId = timestamp();
    const smokeBranch = `${options.branchPrefix}-${smokeRunId}`;
    const smokeCommitMessage = `chore(smoke): ${options.titlePrefix} ${smokeRunId}`;
    const flowDir = join(options.repoDir, "force-app", "main", "default", "flows");
    const gitIgnorePath = join(options.repoDir, ".gitignore");
    const ciPath = join(options.repoDir, ".gitlab-ci.yml");
    cleanFlowDirectory(flowDir);
    writeText(gitIgnorePath, buildRepoGitIgnore());
    writeText(ciPath, buildSmokeCi(SMOKE_TARBALL_NAME));
    writeFixtureFiles(flowDir, fixtures, "before");
    stageAndCommit(options.repoDir, `smoke: seed fixture befores (${smokeRunId})`);
    pushBranch(options.repoDir, options.remote, options.baseBranch);

    createBranch(options.repoDir, smokeBranch);
    cleanFlowDirectory(flowDir);
    writeText(gitIgnorePath, buildRepoGitIgnore());
    writeText(ciPath, buildSmokeCi(SMOKE_TARBALL_NAME));
    writeFixtureFiles(flowDir, fixtures, "after");
    stageAndCommit(options.repoDir, smokeCommitMessage);
    pushBranch(options.repoDir, options.remote, smokeBranch);

    const mr = createMergeRequest({
      repoDir: options.repoDir,
      sourceBranch: smokeBranch,
      targetBranch: options.baseBranch,
    });

    console.log(`Smoke repo: ${options.repoDir}`);
    console.log(`Base branch: ${options.baseBranch}`);
    console.log(`Smoke branch: ${smokeBranch}`);
    console.log(`Merge request: ${mr.web_url}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

function resolveOptions(values: Record<string, string | boolean | undefined>): SmokeOptions {
  return {
    repoDir: resolve(stringValue(values["repo-dir"] ?? process.env.FLOW_DELTA_SMOKE_REPO_DIR ?? DEFAULT_REPO_DIR, "repo dir")),
    remote: stringValue(values.remote ?? process.env.FLOW_DELTA_SMOKE_REMOTE ?? "origin", "remote"),
    remoteUrl: stringValueOptional(values["remote-url"] ?? process.env.FLOW_DELTA_SMOKE_REMOTE_URL),
    baseBranch: stringValue(values["base-branch"] ?? process.env.FLOW_DELTA_SMOKE_BASE_BRANCH ?? DEFAULT_BASE_BRANCH, "base branch"),
    branchPrefix: stringValue(values["branch-prefix"] ?? process.env.FLOW_DELTA_SMOKE_BRANCH_PREFIX ?? DEFAULT_BRANCH_PREFIX, "branch prefix"),
    titlePrefix: stringValue(values["title-prefix"] ?? process.env.FLOW_DELTA_SMOKE_TITLE_PREFIX ?? DEFAULT_TITLE_PREFIX, "title prefix"),
  };
}

function printUsage(): void {
  console.log(`
Usage:
  npm run smoke:gitlab -- [--remote-url <gitlab-repo-url>] [--repo-dir <path>]

Required:
  glab auth status must succeed for the target GitLab host

Optional:
  --repo-dir        local sample-project directory (default: ${DEFAULT_REPO_DIR})
  --remote          git remote name to push to (default: origin)
  --remote-url      add or update this remote URL before pushing
  --base-branch     base branch name (default: ${DEFAULT_BASE_BRANCH})
  --branch-prefix   smoke branch prefix (default: ${DEFAULT_BRANCH_PREFIX})
  --title-prefix    MR title prefix (default: ${DEFAULT_TITLE_PREFIX})
`.trimEnd());
}

function collectFixturePairs(root: string): FixturePair[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const fixtureDir = join(root, name);
      const before = join(fixtureDir, "before.flow-meta.xml");
      const after = join(fixtureDir, "after.flow-meta.xml");
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

function prepareRepoScaffold(repoDir: string): void {
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(join(repoDir, "force-app", "main", "default", "flows"), { recursive: true });
}

// Build the current package and pack it into a tarball under a temp dir.
// Returns the absolute path to the .tgz. Requires the build to emit dist/.
function buildAndPackLocal(root: string): string {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  const dest = mkdtempSync(join(tmpdir(), "flow-delta-pack-"));
  const output = execFileSync("npm", ["pack", "--pack-destination", dest], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const file = output.split("\n").map((line) => line.trim()).filter(Boolean).pop();
  if (!file) {
    throw new Error("npm pack did not report a tarball name");
  }
  return join(dest, file);
}

// CI config for the smoke MR: install the packed local tarball and run its bins,
// instead of npx-installing the published package (which would be stale). Kept
// separate from examples/gitlab-ci.yml, which is the consumer-facing example.
function buildSmokeCi(tarballName: string): string {
  return [
    "FlowDelta:",
    "  image: node:24-alpine",
    "  rules:",
    "    - if: $CI_PIPELINE_SOURCE == \"merge_request_event\"",
    "  variables:",
    "    GIT_DEPTH: 0",
    "  before_script:",
    "    - apk add --no-cache git",
    `    - npm install --no-save "./${tarballName}"`,
    "  script:",
    "    - |",
    "      ./node_modules/.bin/flow-delta \\",
    "        --repo . \\",
    "        --from \"$CI_MERGE_REQUEST_DIFF_BASE_SHA\" \\",
    "        --to   \"$CI_COMMIT_SHA\" \\",
    "        --path 'force-app/**/*.flow-meta.xml' \\",
    "        --changed-only \\",
    "        --out flow-delta-out --json",
    "    - ./node_modules/.bin/flow-delta-gitlab --in flow-delta-out",
    "  artifacts:",
    "    paths: [flow-delta-out]",
    "    expire_in: 30 days",
    "  allow_failure: true",
    "",
  ].join("\n");
}

function buildRepoGitIgnore(): string {
  // Read the sample-project ignore and strip any previously appended smoke
  // blocks so repeated runs stay idempotent (the default repoDir IS this file's
  // directory, so we read and rewrite the same path).
  const raw = readFileSync(join(ROOT, "sample-project", ".gitignore"), "utf8");
  const cleaned = raw
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "# FlowDelta smoke output" && trimmed !== "flow-delta-out/";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  // Note: the packed tarball (SMOKE_TARBALL_NAME) is intentionally NOT ignored —
  // CI must be able to install it from the checked-out repo.
  return [cleaned, "", "# FlowDelta smoke output", "flow-delta-out/"].join("\n");
}

function ensureGitRepo(repoDir: string, baseBranch: string): void {
  if (!existsSync(join(repoDir, ".git"))) {
    execFileSync("git", ["-C", repoDir, "init", "-b", baseBranch], { stdio: "inherit" });
  }

  execFileSync("git", ["-C", repoDir, "config", "user.name", "FlowDelta Smoke"], { stdio: "inherit" });
  execFileSync("git", ["-C", repoDir, "config", "user.email", "flowdelta-smoke@example.com"], { stdio: "inherit" });
  checkoutBranch(repoDir, baseBranch);
}

function ensureRemote(repoDir: string, remote: string, remoteUrl?: string): void {
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

function checkoutBranch(repoDir: string, branch: string): void {
  execFileSync("git", ["-C", repoDir, "switch", branch], { stdio: "inherit" });
}

function createBranch(repoDir: string, branch: string): void {
  execFileSync("git", ["-C", repoDir, "switch", "-c", branch], { stdio: "inherit" });
}

function cleanFlowDirectory(flowDir: string): void {
  mkdirSync(flowDir, { recursive: true });
  for (const entry of readdirSync(flowDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".flow-meta.xml")) {
      rmSync(join(flowDir, entry.name));
    }
  }
}

function writeFixtureFiles(flowDir: string, fixtures: FixturePair[], phase: "before" | "after"): void {
  fixtures.forEach((fixture, index) => {
    const flowName = safeFileName(`smoke-${String(index + 1).padStart(2, "0")}-${fixture.name}`);
    const xml = phase === "before" ? fixture.before : fixture.after;
    const rewritten = renameFlowMetadata(xml, flowName);
    writeText(join(flowDir, `${flowName}.flow-meta.xml`), rewritten);
  });
}

export function renameFlowMetadata(xml: string, nextName: string): string {
  const identityPattern =
    /^([ \t]*)<interviewLabel>([^<]+)<\/interviewLabel>(\r?\n)\1<label>([^<]+)<\/label>/m;
  const identityMatch = xml.match(identityPattern);
  if (!identityMatch) {
    throw new Error("Could not find adjacent top-level <interviewLabel> and <label> in flow XML");
  }

  const [, indentation, interviewLabel, newline, currentName] = identityMatch;
  const nextInterviewLabel = interviewLabel.replace(currentName, nextName);
  return xml.replace(
    identityPattern,
    `${indentation}<interviewLabel>${nextInterviewLabel}</interviewLabel>${newline}${indentation}<label>${nextName}</label>`,
  );
}

function stageAndCommit(repoDir: string, message: string): void {
  execFileSync("git", ["-C", repoDir, "add", "-A"], { stdio: "inherit" });
  execFileSync("git", ["-C", repoDir, "commit", "-m", message], { stdio: "inherit" });
}

function pushBranch(repoDir: string, remote: string, branch: string): void {
  execFileSync("git", ["-C", repoDir, "push", "-u", remote, branch], { stdio: "inherit" });
}

function createMergeRequest(input: {
  repoDir: string;
  sourceBranch: string;
  targetBranch: string;
}): { web_url: string } {
  const glab = resolveGlabCommand();

  execFileSync(
    glab,
    [
      "mr",
      "create",
      "--source-branch",
      input.sourceBranch,
      "--target-branch",
      input.targetBranch,
      "--fill",
      "--remove-source-branch",
      "--yes",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: input.repoDir,
    },
  );

  const output = execFileSync(
    glab,
    ["mr", "view", "--output", "json", input.sourceBranch],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: input.repoDir,
    },
  ).trim();

  const mr = JSON.parse(output) as { web_url?: string };
  if (!mr.web_url) {
    throw new Error("glab mr view did not return a web_url");
  }
  return { web_url: mr.web_url };
}

function resolveGlabCommand(): string {
  const explicit = process.env.GLAB_BIN;
  if (explicit) {
    return explicit;
  }

  try {
    return execFileSync("bash", ["-lc", "command -v glab"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error("Could not find glab. Set GLAB_BIN or ensure glab is available on PATH.");
  }
}

function stringValue(value: string | boolean | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

function stringValueOptional(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function writeText(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
}

function timestamp(): string {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
