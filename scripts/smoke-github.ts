import { copyFileSync, mkdirSync } from "node:fs";
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
  githubRepo: string;
}

const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_BRANCH_PREFIX = "flow-delta-smoke/e2e";
const DEFAULT_TITLE_PREFIX = "FlowDelta smoke/e2e";
const DEFAULT_GITHUB_REPO = "Syntax-Syllogism/flow-delta-example";

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
        "github-repo": { type: "string" },
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

    ensureGithubRepo(options.githubRepo);
    const remoteUrl = options.remoteUrl ?? `https://github.com/${options.githubRepo}.git`;
    const tarballPath = buildAndPackLocal(ROOT);

    prepareRepoScaffold(options.repoDir);
    copyFileSync(tarballPath, join(options.repoDir, SMOKE_TARBALL_NAME));
    ensureGitRepo(options.repoDir, options.baseBranch);
    ensureRemote(options.repoDir, options.remote, remoteUrl);

    const smokeRunId = timestamp();
    const smokeBranch = `${options.branchPrefix}-${smokeRunId}`;
    const smokeCommitMessage = `chore(smoke): ${options.titlePrefix} ${smokeRunId}`;
    const flowDir = join(options.repoDir, "force-app", "main", "default", "flows");
    const flexiPageDir = join(options.repoDir, "force-app", "main", "default", "flexipages");
    const scriptDir = join(options.repoDir, "scripts");
    const workflowDir = join(options.repoDir, ".github", "workflows");
    cleanFlowDirectory(flowDir);
    cleanFlexiPageDirectory(flexiPageDir);
    mkdirSync(scriptDir, { recursive: true });
    mkdirSync(workflowDir, { recursive: true });
    writeText(join(options.repoDir, ".gitignore"), buildRepoGitIgnore());
    writeText(join(workflowDir, "flowdelta.yml"), buildSmokeWorkflow(SMOKE_TARBALL_NAME));
    copyFileSync(join(ROOT, "scripts", "r2-publish.mjs"), join(scriptDir, "r2-publish.mjs"));
    writeFixtureFiles(flowDir, flowFixtures, "before");
    writeFlexiPageFixtureFiles(flexiPageDir, flexiPageFixtures, "before");
    stageAndCommit(options.repoDir, `smoke: seed fixture befores (${smokeRunId})`);
    pushBranch(options.repoDir, options.remote, options.baseBranch);

    createBranch(options.repoDir, smokeBranch);
    cleanFlowDirectory(flowDir);
    cleanFlexiPageDirectory(flexiPageDir);
    writeText(join(options.repoDir, ".gitignore"), buildRepoGitIgnore());
    writeText(join(workflowDir, "flowdelta.yml"), buildSmokeWorkflow(SMOKE_TARBALL_NAME));
    copyFileSync(join(ROOT, "scripts", "r2-publish.mjs"), join(scriptDir, "r2-publish.mjs"));
    writeFixtureFiles(flowDir, flowFixtures, "after");
    writeFlexiPageFixtureFiles(flexiPageDir, flexiPageFixtures, "after");
    stageAndCommit(options.repoDir, smokeCommitMessage);
    pushBranch(options.repoDir, options.remote, smokeBranch);

    const prUrl = createPullRequest({
      repoDir: options.repoDir,
      title: smokeCommitMessage,
      baseBranch: options.baseBranch,
      headBranch: smokeBranch,
    });

    console.log(`Smoke repo: ${options.repoDir}`);
    console.log(`Base branch: ${options.baseBranch}`);
    console.log(`Smoke branch: ${smokeBranch}`);
    console.log(`Pull request: ${prUrl}`);
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
    githubRepo: stringValue(values["github-repo"] ?? process.env.FLOW_DELTA_SMOKE_GITHUB_REPO ?? DEFAULT_GITHUB_REPO, "GitHub repo"),
  };
}

function printUsage(): void {
  console.log(`
Usage:
  npm run smoke:github -- [--github-repo <owner/repo>] [--repo-dir <path>]

Required:
  gh auth status must succeed for the target GitHub host
  The target repo must have the R2/Worker secrets and ARTIFACT_BASE_URL variable from docs/ci.md

Optional:
  --repo-dir        local sample-project directory (default: ${DEFAULT_REPO_DIR})
  --remote          git remote name to push to (default: origin)
  --remote-url      add or update this remote URL before pushing
  --base-branch     base branch name (default: ${DEFAULT_BASE_BRANCH})
  --branch-prefix   smoke branch prefix (default: ${DEFAULT_BRANCH_PREFIX})
  --title-prefix    PR title prefix (default: ${DEFAULT_TITLE_PREFIX})
  --github-repo     demo repo (default: ${DEFAULT_GITHUB_REPO})
`.trimEnd());
}

export function buildSmokeWorkflow(tarballName: string): string {
  return [
    "name: FlowDelta",
    "",
    "on: pull_request",
    "",
    "permissions:",
    "  contents: read",
    "  pull-requests: write",
    "",
    "jobs:",
    "  flowdelta:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 24",
    `      - run: npm install --no-save ./${tarballName}`,
    "      - run: |",
    "          ./node_modules/.bin/flow-delta \\",
    "            --repo . \\",
    '            --from "${{ github.event.pull_request.base.sha }}" \\',
    '            --to   "${{ github.sha }}" \\',
    "            --path 'force-app/**/*.flow-meta.xml' \\",
    "            --changed-only \\",
    "            --out flow-delta-out --json",
    "      - run: |",
    "          ./node_modules/.bin/flexipage-delta \\",
    "            --repo . \\",
    '            --from "${{ github.event.pull_request.base.sha }}" \\',
    '            --to   "${{ github.sha }}" \\',
    "            --path 'force-app/**/*.flexipage-meta.xml' \\",
    "            --changed-only \\",
    "            --out flexipage-delta-out --json",
    "      - uses: actions/upload-artifact@v4",
    "        with:",
    "          name: flow-delta-out",
    "          path: flow-delta-out",
    "      - uses: actions/upload-artifact@v4",
    "        with:",
    "          name: flexipage-delta-out",
    "          path: flexipage-delta-out",
    "      - name: Publish to R2 + sign",
    "        env:",
    "          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}",
    "          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}",
    "          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}",
    "          R2_BUCKET: ${{ secrets.R2_BUCKET }}",
    "          ARTIFACT_BASE_URL: ${{ vars.ARTIFACT_BASE_URL }}",
    "          ARTIFACT_HMAC_KEY: ${{ secrets.ARTIFACT_HMAC_KEY }}",
    '        run: node scripts/r2-publish.mjs flow-delta-out "$GITHUB_REPOSITORY/${{ github.event.number }}/$GITHUB_SHA" > flow-delta-out/urls.json',
    "        continue-on-error: true",
    "      - name: Publish FlexiPage to R2 + sign",
    "        env:",
    "          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}",
    "          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}",
    "          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}",
    "          R2_BUCKET: ${{ secrets.R2_BUCKET }}",
    "          ARTIFACT_BASE_URL: ${{ vars.ARTIFACT_BASE_URL }}",
    "          ARTIFACT_HMAC_KEY: ${{ secrets.ARTIFACT_HMAC_KEY }}",
    '        run: node scripts/r2-publish.mjs flexipage-delta-out "$GITHUB_REPOSITORY/${{ github.event.number }}/$GITHUB_SHA" > flexipage-delta-out/urls.json',
    "        continue-on-error: true",
    "      - run: ./node_modules/.bin/flow-delta-github --in flow-delta-out --artifact-urls flow-delta-out/urls.json",
    "        env:",
    "          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    "        continue-on-error: true",
    "      - run: ./node_modules/.bin/flexipage-delta-github --in flexipage-delta-out --artifact-urls flexipage-delta-out/urls.json",
    "        env:",
    "          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    "        continue-on-error: true",
    "",
  ].join("\n");
}

function ensureGithubRepo(repo: string): void {
  const gh = resolveGhCommand();
  try {
    execFileSync(gh, ["repo", "view", repo], { stdio: ["ignore", "ignore", "pipe"] });
  } catch {
    execFileSync(gh, ["repo", "create", repo, "--public"], { stdio: "inherit" });
  }
}

function createPullRequest(input: {
  repoDir: string;
  title: string;
  baseBranch: string;
  headBranch: string;
}): string {
  const gh = resolveGhCommand();
  return execFileSync(
    gh,
    [
      "pr",
      "create",
      "--title",
      input.title,
      "--body",
      "FlowDelta smoke/e2e demo",
      "--base",
      input.baseBranch,
      "--head",
      input.headBranch,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: input.repoDir,
    },
  ).trim();
}

function resolveGhCommand(): string {
  const explicit = process.env.GH_BIN;
  if (explicit) {
    return explicit;
  }
  return "gh";
}

if (isMainModule(import.meta.url)) {
  void main();
}
