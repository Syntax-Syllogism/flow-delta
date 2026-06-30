import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { FlowParser } from "./parser/flow_parser.ts";
import { buildModel } from "./model/build-model.ts";
import type { GraphModel } from "./model/graph-model.ts";
import { diffModel } from "./diff/diff-model.ts";
import { layoutDiff } from "./render/layout.ts";
import { renderHtml } from "./render/render-html.ts";
import { readFlowFromFile, readFlowFromGit } from "./io/read-flow.ts";
import { safeFileName } from "./util/file-name.ts";
import { isMainModule } from "./util/is-main-module.ts";

export interface CliOptions {
  old?: string;
  new?: string;
  from?: string;
  to?: string;
  repo?: string;
  path?: string;
  out?: string;
  json?: boolean;
  help?: boolean;
}

type ParsedCliOptions = CliOptions & {
  "changed-only"?: boolean;
};

const CLI_USAGE = `Usage:
  flow-delta --old <old.flow-meta.xml> --new <new.flow-meta.xml> [--out dir] [--json]
  flow-delta --from <ref> --to <ref> --repo <path> --path <glob> [--changed-only] [--out dir] [--json]
`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args: argv,
    options: {
      old: { type: "string" },
      new: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      repo: { type: "string" },
      path: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean" },
      "changed-only": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  const options = parsed.values as ParsedCliOptions;
  if (options.help) {
    console.log(CLI_USAGE.trimEnd());
    return;
  }

  const outDir = resolve(options.out ?? "./flow-delta-out");
  mkdirSync(outDir, { recursive: true });

  try {
    if (options.old || options.new) {
      if (!options.old || !options.new) {
        throw new Error("File mode requires both --old and --new");
      }
      await runFileMode(options.old, options.new, outDir, Boolean(options.json));
      return;
    }

    if (options.from || options.to || options.repo || options.path) {
      if (!options.from || !options.to || !options.repo || !options.path) {
        throw new Error("Git mode requires --from, --to, --repo, and --path");
      }
      await runGitMode(
        options.repo,
        options.from,
        options.to,
        options.path,
        outDir,
        Boolean(options.json),
        Boolean(options["changed-only"]),
      );
      return;
    }

    throw new Error("Specify either --old/--new or --from/--to/--repo/--path");
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

async function runFileMode(oldPath: string, newPath: string, outDir: string, writeJson: boolean): Promise<void> {
  const oldModel = buildModel(await parseXml(readFlowFromFile(oldPath)));
  const newModel = buildModel(await parseXml(readFlowFromFile(newPath)));
  await writeArtifacts(oldModel, newModel, outDir, writeJson);
}

async function runGitMode(
  repo: string,
  from: string,
  to: string,
  pattern: string,
  outDir: string,
  writeJson: boolean,
  changedOnly: boolean,
): Promise<void> {
  const files = discoverGitFiles(repo, from, to, pattern, changedOnly);
  let hadFailure = false;

  for (const filePath of files) {
    try {
      const oldXml = readFlowFromGit(repo, from, filePath);
      const newXml = readFlowFromGit(repo, to, filePath);
      const oldModel = oldXml ? buildModel(await parseXml(oldXml)) : buildEmptyModel();
      const newModel = newXml ? buildModel(await parseXml(newXml)) : buildEmptyModel();
      await writeArtifacts(oldModel, newModel, outDir, writeJson, filePath);
    } catch (error) {
      hadFailure = true;
      console.error(`${filePath}: ${(error as Error).message}`);
    }
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

async function parseXml(xml: string) {
  const parser = new FlowParser(xml);
  return parser.generateFlowDefinition();
}

function buildEmptyModel() {
  return {
    flowName: "(unknown)",
    label: "(unknown)",
    nodes: [],
    edges: [],
  } satisfies GraphModel;
}

async function writeArtifacts(
  oldModel: GraphModel,
  newModel: GraphModel,
  outDir: string,
  writeJson: boolean,
  sourcePath?: string,
): Promise<void> {
  const diff = diffModel(oldModel, newModel);
  const layout = await layoutDiff(diff);
  const html = renderHtml(layout);
  const fileStem = safeFileName(diff.flowName || sourcePath || "flow");
  writeFileSync(join(outDir, `${fileStem}.html`), html, "utf8");
  if (writeJson) {
    writeFileSync(join(outDir, `${fileStem}.diff.json`), JSON.stringify(diff, null, 2), "utf8");
  }
  console.log(
    `${diff.flowName}: nodes ${diff.summary.addedNodes} added, ${diff.summary.removedNodes} deleted, ${diff.summary.modifiedNodes} modified; edges ${diff.summary.addedEdges} added, ${diff.summary.removedEdges} deleted`,
  );
}

function discoverGitFiles(repo: string, from: string, to: string, pattern: string, changedOnly: boolean): string[] {
  const matcher = createPathMatcher(pattern);
  if (!changedOnly) {
    const fromFiles = listGitTree(repo, from);
    const toFiles = listGitTree(repo, to);
    const files = [...new Set([...fromFiles, ...toFiles])];
    return files.filter((file) => matcher(file)).sort();
  }

  return listChangedGitFiles(repo, from, to, pattern).filter((file) => matcher(file)).sort();
}

function listGitTree(repo: string, ref: string): string[] {
  return listGitFiles(repo, ["ls-tree", "-r", "--name-only", ref]);
}

function listChangedGitFiles(repo: string, from: string, to: string, pattern: string): string[] {
  return listGitFiles(repo, ["diff", "--name-only", "--diff-filter=ACMRD", from, to, "--", pattern]);
}

function listGitFiles(repo: string, args: string[]): string[] {
  return splitLines(
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

function splitLines(output: string): string[] {
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function createPathMatcher(pattern: string): (path: string) => boolean {
  if (!hasGlob(pattern)) {
    const normalized = pattern.replaceAll("\\", "/");
    return (path) => path === normalized;
  }
  const regex = globToRegExp(pattern.replaceAll("\\", "/"));
  return (path) => regex.test(path);
}

function hasGlob(value: string): boolean {
  return /[*?[\]]/.test(value);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if ("\\^$+?.()|{}[]".includes(char)) {
      source += `\\${char}`;
      continue;
    }
    source += char;
  }
  source += "$";
  return new RegExp(source);
}
if (isMainModule(import.meta.url)) {
  void main();
}
