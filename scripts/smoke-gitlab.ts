import { copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { isMainModule } from "../src/util/is-main-module.ts";
import {
  DEFAULT_REPO_DIR,
  ROOT,
  SMOKE_TARBALL_NAME,
  buildAndPackLocal,
  buildRepoGitIgnore,
  cleanFlowDirectory,
  cleanFlexiPageDirectory,
  collectFlexiPageFixturePairs,
  collectFixturePairs,
  createBranch,
  ensureGitRepo,
  ensureRemote,
  pushBranch,
  stageAndCommit,
  stringValue,
  stringValueOptional,
  timestamp,
  prepareRepoScaffold,
  writeFixtureFiles,
  writeFlexiPageFixtureFiles,
  writeText,
} from "./smoke-common.ts";

interface SmokeOptions {
  repoDir: string;
  remote: string;
  remoteUrl?: string;
  baseBranch: string;
  branchPrefix: string;
  titlePrefix: string;
}

const DEFAULT_BASE_BRANCH = "master";
const DEFAULT_BRANCH_PREFIX = "flow-delta-smoke/e2e";
const DEFAULT_TITLE_PREFIX = "FlowDelta smoke/e2e";

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
    const flowFixtures = collectFixturePairs(join(ROOT, "fixtures", "diff"));
    const flexiPageFixtures = [
      ...collectFlexiPageFixturePairs(join(ROOT, "fixtures", "flexipage-diff"), "diff"),
      ...collectFlexiPageFixturePairs(join(ROOT, "fixtures", "flexipage-template"), "template"),
    ];
    if (flowFixtures.length === 0 || flexiPageFixtures.length === 0) {
      throw new Error("No Flow or FlexiPage fixture pairs found");
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
    const flexiPageDir = join(options.repoDir, "force-app", "main", "default", "flexipages");
    const gitIgnorePath = join(options.repoDir, ".gitignore");
    const ciPath = join(options.repoDir, ".gitlab-ci.yml");
    cleanFlowDirectory(flowDir);
    cleanFlexiPageDirectory(flexiPageDir);
    writeText(gitIgnorePath, buildRepoGitIgnore());
    writeText(ciPath, buildSmokeCi(SMOKE_TARBALL_NAME));
    writeFixtureFiles(flowDir, flowFixtures, "before");
    writeFlexiPageFixtureFiles(flexiPageDir, flexiPageFixtures, "before");
    stageAndCommit(options.repoDir, `smoke: seed fixture befores (${smokeRunId})`);
    pushBranch(options.repoDir, options.remote, options.baseBranch);

    createBranch(options.repoDir, smokeBranch);
    cleanFlowDirectory(flowDir);
    cleanFlexiPageDirectory(flexiPageDir);
    writeText(gitIgnorePath, buildRepoGitIgnore());
    writeText(ciPath, buildSmokeCi(SMOKE_TARBALL_NAME));
    writeFixtureFiles(flowDir, flowFixtures, "after");
    writeFlexiPageFixtureFiles(flexiPageDir, flexiPageFixtures, "after");
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
    "        --to   \"${CI_MERGE_REQUEST_SOURCE_BRANCH_SHA:-$CI_COMMIT_SHA}\" \\",
    "        --path 'force-app/**/*.flow-meta.xml' \\",
    "        --changed-only \\",
    "        --out flow-delta-out --json",
    "    - |",
    "      ./node_modules/.bin/flexipage-delta \\",
    "        --repo . \\",
    "        --from \"$CI_MERGE_REQUEST_DIFF_BASE_SHA\" \\",
    "        --to   \"${CI_MERGE_REQUEST_SOURCE_BRANCH_SHA:-$CI_COMMIT_SHA}\" \\",
    "        --path 'force-app/**/*.flexipage-meta.xml' \\",
    "        --changed-only \\",
    "        --out flexipage-delta-out --json",
    "    - ./node_modules/.bin/flow-delta-gitlab --in flow-delta-out",
    "    - ./node_modules/.bin/flexipage-delta-gitlab --in flexipage-delta-out",
    "  artifacts:",
    "    paths: [flow-delta-out, flexipage-delta-out]",
    "    expire_in: 30 days",
    "  allow_failure: true",
    "",
  ].join("\n");
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

if (isMainModule(import.meta.url)) {
  void main();
}
