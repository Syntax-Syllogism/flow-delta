import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FlowParser } from "./parser/flow_parser.ts";
import { buildModel } from "./model/build-model.ts";
import type { GraphModel } from "./model/graph-model.ts";
import { extractFlowHeader } from "./model/flow-header.ts";
import { diffModel } from "./diff/diff-model.ts";
import { layoutDiff } from "./render/layout.ts";
import { renderHtml } from "./render/render-html.ts";
import { discoverGitMetadataFiles } from "./io/discover-git-metadata.ts";
import { readMetadataFromFile, readMetadataFromGit } from "./io/read-metadata.ts";
import {
  listFlowVersions,
  retrieveFlowVersions,
} from "./io/read-flow-from-org.ts";
import { pickFlowAndVersions } from "./cli-prompt.ts";
import { ERROR_MESSAGES } from "./parser/flow_parser.ts";
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
  org?: string;
  flow?: string;
  "from-version"?: string;
  "to-version"?: string;
  interactive?: boolean;
  keep?: boolean;
}

type ParsedCliOptions = CliOptions & {
  "changed-only"?: boolean;
};

const CLI_USAGE = `Usage:
  flow-delta --old <old.flow-meta.xml> --new <new.flow-meta.xml> [--out dir] [--json]
  flow-delta --from <ref> --to <ref> --repo <path> --path <glob> [--changed-only] [--out dir] [--json]
  flow-delta --org <alias> [--flow <Name>] [--from-version <n> --to-version <n>] [--interactive] [--keep] [--out dir] [--json]
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
      org: { type: "string" },
      flow: { type: "string" },
      "from-version": { type: "string" },
      "to-version": { type: "string" },
      interactive: { type: "boolean" },
      keep: { type: "boolean" },
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
      reportOutputLocation(outDir);
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
      reportOutputLocation(outDir);
      return;
    }

    if (options.org || options.flow || options["from-version"] || options["to-version"] || options.interactive || options.keep) {
      if (!options.org) {
        throw new Error("Org mode requires --org");
      }
      await runOrgMode(options, outDir, Boolean(options.json));
      reportOutputLocation(outDir);
      return;
    }

    throw new Error("Specify either file, git, or org mode options");
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

function reportOutputLocation(outDir: string): void {
  console.log(`Artifacts written to ${outDir}`);
}

function parseVersionOption(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return version;
}

export interface OrgModeDependencies {
  listFlowVersions: typeof listFlowVersions;
  retrieveFlowVersions: typeof retrieveFlowVersions;
  pickFlowAndVersions: typeof pickFlowAndVersions;
  runFileMode: typeof runFileMode;
}

const defaultOrgModeDependencies: OrgModeDependencies = {
  listFlowVersions,
  retrieveFlowVersions,
  pickFlowAndVersions,
  runFileMode,
};

export async function runOrgMode(
  options: ParsedCliOptions,
  outDir: string,
  writeJson: boolean,
  dependencies: OrgModeDependencies = defaultOrgModeDependencies,
): Promise<void> {
  console.error(
    `Org mode: querying Flow versions from Salesforce org ${options.org}${options.flow ? ` for ${options.flow}` : ""}...`,
  );
  const versions = dependencies.listFlowVersions(options.org!, options.flow);
  console.error(`Org mode: received ${versions.length} Flow version record${versions.length === 1 ? "" : "s"}.`);
  if (versions.length === 0) {
    if (options.flow) {
      throw new Error(`Flow ${options.flow} was not found in Salesforce org ${options.org}.`);
    }
    throw new Error("No Flow versions were found in the Salesforce org.");
  }

  const fromVersion = parseVersionOption(options["from-version"], "--from-version");
  const toVersion = parseVersionOption(options["to-version"], "--to-version");
  if (fromVersion !== undefined && toVersion !== undefined && fromVersion === toVersion) {
    throw new Error("--from-version and --to-version must be different flow versions.");
  }
  const shouldPrompt = Boolean(options.interactive) || !options.flow || fromVersion === undefined || toVersion === undefined;
  let selection: { developerName: string; fromVersion: number; toVersion: number };
  if (shouldPrompt) {
    selection = await dependencies.pickFlowAndVersions(versions, options.flow);
  } else {
    selection = {
      developerName: options.flow!,
      fromVersion,
      toVersion,
    };
  }

  const selectedVersions = versions.filter(
    (version) =>
      version.developerName === selection.developerName &&
      (version.versionNumber === selection.fromVersion || version.versionNumber === selection.toVersion),
  );
  if (selectedVersions.length !== 2) {
    const missing = [selection.fromVersion, selection.toVersion].find(
      (versionNumber) => !selectedVersions.some((version) => version.versionNumber === versionNumber),
    );
    throw new Error(
      `Flow ${selection.developerName} version ${missing} was not found in Salesforce org ${options.org}.`,
    );
  }

  console.error(
    `Org mode: retrieving Flow ${selection.developerName} versions ${selection.fromVersion} and ${selection.toVersion} from Salesforce...`,
  );
  const retrieved = dependencies.retrieveFlowVersions(
    options.org!,
    selection.developerName,
    [selection.fromVersion, selection.toVersion],
    { keep: Boolean(options.keep) },
  );
  console.error(
    `Org mode: retrieved Flow ${selection.developerName} versions ${selection.fromVersion} and ${selection.toVersion}.`,
  );
  try {
    const oldPath = retrieved.versions.find((version) => version.versionNumber === selection.fromVersion)?.path;
    const newPath = retrieved.versions.find((version) => version.versionNumber === selection.toVersion)?.path;
    if (!oldPath || !newPath) {
      throw new Error("The `sf` retrieve response did not include both requested Flow versions.");
    }
    try {
      await dependencies.runFileMode(oldPath, newPath, outDir, writeJson);
    } catch (error) {
      if ((error as Error).message === ERROR_MESSAGES.flowStartNotDefined) {
        throw new Error(
          `Flow ${selection.developerName} version ${selection.fromVersion} or ${selection.toVersion} uses the legacy Flow format without a <start> element. This version is unsupported; compare a modern Flow version instead.`,
        );
      }
      throw error;
    }
  } finally {
    if (options.keep) {
      console.log(`Retrieved Flow versions kept in ${retrieved.workDir}`);
    } else {
      retrieved.cleanup();
    }
  }
}

async function runFileMode(oldPath: string, newPath: string, outDir: string, writeJson: boolean): Promise<void> {
  const oldXml = readMetadataFromFile(oldPath);
  const newXml = readMetadataFromFile(newPath);
  const oldModel = await buildModelWithHeader(oldXml);
  const newModel = await buildModelWithHeader(newXml);
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
  const files = discoverGitMetadataFiles({
    repo,
    fromRef: from,
    toRef: to,
    pattern,
    changedOnly,
  });
  let hadFailure = false;

  for (const filePath of files) {
    try {
      const oldXml = readMetadataFromGit(repo, from, filePath);
      const newXml = readMetadataFromGit(repo, to, filePath);
      const oldModel = oldXml ? await buildModelWithHeader(oldXml) : buildEmptyModel();
      const newModel = newXml ? await buildModelWithHeader(newXml) : buildEmptyModel();
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

async function buildModelWithHeader(xml: string): Promise<GraphModel> {
  const model = buildModel(await parseXml(xml));
  model.header = await extractFlowHeader(xml);
  return model;
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
    `${diff.flowName}: nodes ${diff.summary.addedNodes} added, ${diff.summary.removedNodes} deleted, ${diff.summary.modifiedNodes} modified; edges ${diff.summary.addedEdges} added, ${diff.summary.removedEdges} deleted${formatFlowAttributeSummary(diff.flowChanges)}`,
  );
}

function formatFlowAttributeSummary(flowChanges: ReturnType<typeof diffModel>["flowChanges"]): string {
  if (!flowChanges || flowChanges.length === 0) {
    return "";
  }
  return `; flow attributes: ${flowChanges.length} changed (${flowChanges.map((change) => change.path).join(", ")})`;
}

if (isMainModule(import.meta.url)) {
  void main();
}
