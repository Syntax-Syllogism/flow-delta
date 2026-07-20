import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export interface FlowVersion {
  developerName: string;
  versionNumber: number;
  status: string;
  label: string;
  lastModifiedBy: string;
  lastModifiedDate: string;
}

export interface RetrievedFlowVersion {
  versionNumber: number;
  path: string;
}

export interface RetrievedFlowVersions {
  workDir: string;
  versions: RetrievedFlowVersion[];
  cleanup: () => void;
}

export type SfRunner = (args: string[], cwd?: string) => string;

const VERSION_QUERY =
  "SELECT Definition.DeveloperName, VersionNumber, Status, MasterLabel, LastModifiedDate, LastModifiedBy.Name FROM Flow ORDER BY Definition.DeveloperName, VersionNumber";
const SF_TIMEOUT_MS = 120_000;

export class SfCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SfCliError";
  }
}

function isAuthenticationFailure(detail: string): boolean {
  return (
    detail.includes("not authenticated") ||
    detail.includes("authentication") ||
    detail.includes("authorization") ||
    detail.includes("no auth") ||
    detail.includes("login") ||
    detail.includes("unauthorized")
  );
}

function quoteWindowsShellArg(value: string): string {
  if (!/[\s"]/.test(value)) {
    return value;
  }
  return `"${value.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}

function defaultSfRunner(args: string[], cwd?: string): string {
  try {
    const windows = process.platform === "win32";
    return execFileSync(windows ? "sf.cmd" : "sf", windows ? args.map(quoteWindowsShellArg) : args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: windows,
      timeout: SF_TIMEOUT_MS,
    });
  } catch (error) {
    const processError = error as {
      code?: string | number;
      stderr?: Buffer | string;
      killed?: boolean;
      signal?: string;
    };
    const detail = String(processError.stderr ?? "").toLowerCase();
    if (
      processError.code === "ENOENT" ||
      detail.includes("not recognized") ||
      detail.includes("command not found")
    ) {
      throw new SfCliError(
        "Salesforce CLI (`sf`) was not found on PATH. Install Salesforce CLI and try again.",
      );
    }

    if (processError.code === "ETIMEDOUT" || processError.killed || processError.signal === "SIGTERM") {
      throw new SfCliError(
        "The `sf` CLI timed out after two minutes. Check Salesforce authentication and network connectivity, then try again.",
      );
    }

    if (isAuthenticationFailure(detail)) {
      throw new SfCliError(
        "Salesforce org is not authenticated in `sf`. Run `sf org login web` and try again.",
      );
    }
    throw new SfCliError(
      "The `sf` CLI could not complete the Salesforce request. Check the org alias and Salesforce CLI output.",
    );
  }
}

export function runSfJson(
  args: string[],
  cwd?: string,
  runner: SfRunner = defaultSfRunner,
): unknown {
  let stdout: string;
  try {
    stdout = runner(args, cwd);
  } catch (error) {
    if (error instanceof SfCliError) {
      throw error;
    }
    const processError = error as {
      code?: string | number;
      stderr?: Buffer | string;
      killed?: boolean;
      signal?: string;
    };
    if (processError.code === "ENOENT") {
      throw new SfCliError(
        "Salesforce CLI (`sf`) was not found on PATH. Install Salesforce CLI and try again.",
      );
    }
    if (processError.code === "ETIMEDOUT" || processError.killed || processError.signal === "SIGTERM") {
      throw new SfCliError(
        "The `sf` CLI timed out after two minutes. Check Salesforce authentication and network connectivity, then try again.",
      );
    }
    if (isAuthenticationFailure(String(processError.stderr ?? "").toLowerCase())) {
      throw new SfCliError(
        "Salesforce org is not authenticated in `sf`. Run `sf org login web` and try again.",
      );
    }
    throw new SfCliError(
      "The `sf` CLI could not complete the Salesforce request. Check the org alias and Salesforce CLI output.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new SfCliError(
      "The `sf` CLI returned an invalid JSON response. Verify that the installed Salesforce CLI is working.",
    );
  }

  const response = parsed as { status?: number; result?: unknown };
  if (response.status !== undefined && response.status !== 0) {
    if (isAuthenticationFailure(JSON.stringify(parsed).toLowerCase())) {
      throw new SfCliError(
        "Salesforce org is not authenticated in `sf`. Run `sf org login web` and try again.",
      );
    }
    throw new SfCliError(
      "The `sf` CLI reported a failed Salesforce request. Check that the org is authenticated and the requested metadata exists.",
    );
  }
  return response.result ?? parsed;
}

export function listFlowVersions(
  org: string,
  developerName?: string,
  runner: SfRunner = defaultSfRunner,
): FlowVersion[] {
  const result = runSfJson(
    [
      "data",
      "query",
      "--use-tooling-api",
      "--target-org",
      org,
      "--query",
      VERSION_QUERY,
      "--json",
    ],
    undefined,
    runner,
  ) as { records?: unknown[] };

  const versions = (result.records ?? []).flatMap((record) => {
    const value = record as {
      Definition?: { DeveloperName?: unknown };
      VersionNumber?: unknown;
      Status?: unknown;
      MasterLabel?: unknown;
      LastModifiedDate?: unknown;
      LastModifiedBy?: { Name?: unknown };
    };
    const name = value.Definition?.DeveloperName;
    const versionNumber = Number(value.VersionNumber);
    if (typeof name !== "string" || !Number.isInteger(versionNumber)) {
      return [];
    }
    return [
      {
        developerName: name,
        versionNumber,
        status: String(value.Status ?? "Unknown"),
        label: String(value.MasterLabel ?? ""),
        lastModifiedBy: String(value.LastModifiedBy?.Name ?? "Unknown"),
        lastModifiedDate: String(value.LastModifiedDate ?? "Unknown"),
      },
    ];
  });

  return versions
    .filter((version) => !developerName || version.developerName === developerName)
    .sort(
      (left, right) =>
        left.developerName.localeCompare(right.developerName) ||
        left.versionNumber - right.versionNumber,
    );
}

function metadataName(developerName: string, versionNumber: number): string {
  return `${developerName}-${versionNumber}`;
}

function createScaffold(workDir: string): void {
  mkdirSync(join(workDir, "force-app"), { recursive: true });
  writeFileSync(
    join(workDir, "sfdx-project.json"),
    JSON.stringify(
      {
        packageDirectories: [{ path: "force-app", default: true }],
        namespace: "",
        sourceApiVersion: "60.0",
      },
      null,
      2,
    ),
    "utf8",
  );
}

function responseFiles(result: unknown): Array<{ fullName?: string; filePath: string }> {
  const files = (result as { files?: unknown[] }).files;
  if (!Array.isArray(files)) {
    throw new SfCliError("The `sf` retrieve response did not include any files.");
  }
  return files.flatMap((file) => {
    const value = file as { fullName?: unknown; filePath?: unknown };
    return typeof value.filePath === "string"
      ? [{
          fullName: typeof value.fullName === "string" ? value.fullName : undefined,
          filePath: value.filePath,
        }]
      : [];
  });
}

function resolveRetrievedPaths(
  files: Array<{ fullName?: string; filePath: string }>,
  developerName: string,
  versions: number[],
  workDir: string,
): RetrievedFlowVersion[] {
  const highestVersion = Math.max(...versions);
  const used = new Set<string>();
  const resolved = versions.map((versionNumber) => {
    const expectedName = metadataName(developerName, versionNumber);
    let file = files.find((candidate) => candidate.fullName === expectedName && !used.has(candidate.filePath));
    if (!file) {
      file = files.find(
        (candidate) =>
          basename(candidate.filePath) === `${expectedName}.flow-meta.xml` &&
          !used.has(candidate.filePath),
      );
    }
    if (!file && versionNumber === highestVersion) {
      file = files.find(
        (candidate) =>
          basename(candidate.filePath) === `${developerName}.flow-meta.xml` &&
          !used.has(candidate.filePath),
      );
    }
    if (!file) {
      throw new SfCliError(
        `The \`sf\` retrieve response did not include Flow ${developerName} version ${versionNumber}.`,
      );
    }
    used.add(file.filePath);
    return { versionNumber, path: resolve(workDir, file.filePath) };
  });
  return resolved;
}

export function retrieveFlowVersions(
  org: string,
  developerName: string,
  versions: number[],
  options: { keep?: boolean } = {},
  runner: SfRunner = defaultSfRunner,
): RetrievedFlowVersions {
  if (versions.length !== 2 || new Set(versions).size !== 2 || versions.some((version) => !Number.isInteger(version))) {
    throw new Error("Org mode requires two different integer flow versions.");
  }

  const workDir = mkdtempSync(join(tmpdir(), "flow-delta-org-"));
  const cleanup = () => rmSync(workDir, { recursive: true, force: true });
  try {
    createScaffold(workDir);
    const metadataArgs = versions.flatMap((version) => ["-m", `Flow:${metadataName(developerName, version)}`]);
    const result = runSfJson(
      [
        "project",
        "retrieve",
        "start",
        "--target-org",
        org,
        ...metadataArgs,
        "--json",
      ],
      workDir,
      runner,
    );
    return {
      workDir,
      versions: resolveRetrievedPaths(responseFiles(result), developerName, versions, workDir),
      cleanup,
    };
  } catch (error) {
    if (!options.keep) {
      cleanup();
    }
    throw error;
  }
}
