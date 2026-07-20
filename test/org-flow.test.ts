import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Readable, PassThrough } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";
import {
  listFlowVersions,
  retrieveFlowVersions,
  runSfJson,
  type FlowVersion,
  type SfRunner,
} from "../src/io/read-flow-from-org.ts";
import { pickFlowAndVersions } from "../src/cli-prompt.ts";
import { ERROR_MESSAGES } from "../src/parser/flow_parser.ts";
import { runOrgMode, type OrgModeDependencies } from "../src/cli.ts";

const versions = [
  {
    Definition: { DeveloperName: "My_Flow" },
    VersionNumber: 1,
    Status: "Obsolete",
    MasterLabel: "Initial",
    LastModifiedDate: "2026-07-17T10:00:00.000Z",
    LastModifiedBy: { Name: "Ada Lovelace" },
  },
  {
    Definition: { DeveloperName: "My_Flow" },
    VersionNumber: 2,
    Status: "Active",
    MasterLabel: "Current",
    LastModifiedDate: "2026-07-18T10:00:00.000Z",
    LastModifiedBy: { Name: "Grace Hopper" },
  },
];

test("lists typed Flow versions from a Tooling API JSON response", () => {
  const calls: string[][] = [];
  const runner: SfRunner = (args) => {
    calls.push(args);
    return JSON.stringify({ status: 0, result: { records: versions } });
  };

  assert.deepEqual(listFlowVersions("dev", "My_Flow", runner), [
    {
      developerName: "My_Flow",
      versionNumber: 1,
      status: "Obsolete",
      label: "Initial",
      lastModifiedBy: "Ada Lovelace",
      lastModifiedDate: "2026-07-17T10:00:00.000Z",
    },
    {
      developerName: "My_Flow",
      versionNumber: 2,
      status: "Active",
      label: "Current",
      lastModifiedBy: "Grace Hopper",
      lastModifiedDate: "2026-07-18T10:00:00.000Z",
    },
  ]);
  assert.ok(calls[0].includes("--use-tooling-api"));
  assert.ok(calls[0].includes("--target-org"));
  assert.ok(calls[0].includes("--json"));
});

test("uses exact retrieve file paths, including the suffix-stripped highest version", () => {
  let retrieveCwd = "";
  const runner: SfRunner = (args, cwd) => {
    assert.deepEqual(args.filter((arg) => arg === "-m"), ["-m", "-m"]);
    retrieveCwd = cwd ?? "";
    assert.ok(existsSync(`${retrieveCwd}/sfdx-project.json`));
    assert.ok(existsSync(`${retrieveCwd}/force-app`));
    return JSON.stringify({
      status: 0,
      result: {
        files: [
          { fullName: "My_Flow-1", filePath: "force-app/My_Flow-1.flow-meta.xml" },
          { fullName: "My_Flow-2", filePath: "force-app/My_Flow.flow-meta.xml" },
        ],
      },
    });
  };

  const retrieved = retrieveFlowVersions("dev", "My_Flow", [1, 2], {}, runner);
  assert.equal(retrieved.versions[0].path, resolve(retrieveCwd, "force-app/My_Flow-1.flow-meta.xml"));
  assert.equal(retrieved.versions[1].path, resolve(retrieveCwd, "force-app/My_Flow.flow-meta.xml"));
  assert.equal(basename(retrieved.versions[1].path), "My_Flow.flow-meta.xml");
  retrieved.cleanup();
  assert.equal(existsSync(retrieved.workDir), false);
});

test("the sf JSON runner never writes token-bearing JSON to output", () => {
  const token = "00D000000000001!fake-access-token";
  const output: string[] = [];
  const runner: SfRunner = () =>
    JSON.stringify({ status: 0, result: { accessToken: token, records: [] } });
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => output.push(args.join(" "));
  console.error = (...args: unknown[]) => output.push(args.join(" "));
  try {
    assert.deepEqual(runSfJson(["org", "list", "--json"], undefined, runner), {
      accessToken: token,
      records: [],
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(output.join(" ").includes(token), false);
});

test("interactive picker shows version metadata and defaults to the latest two", async () => {
  const input = Readable.from(["\n"]);
  const output = new PassThrough();
  const outputChunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => outputChunks.push(chunk));
  const selection = await pickFlowAndVersions(
    versions.map((version) => ({
      developerName: version.Definition.DeveloperName,
      versionNumber: version.VersionNumber,
      status: version.Status,
      label: version.MasterLabel,
      lastModifiedBy: version.LastModifiedBy.Name,
      lastModifiedDate: version.LastModifiedDate,
    })),
    "My_Flow",
    input,
    output,
  );

  assert.deepEqual(selection, { developerName: "My_Flow", fromVersion: 1, toVersion: 2 });
  const rendered = Buffer.concat(outputChunks).toString("utf8");
  assert.match(rendered, /#\s+Version\s+Status\s+Label\s+Last modified by\s+Last modified date/);
  assert.match(rendered, /1\s+1\s+Obsolete/);
  assert.match(rendered, /Active/);
  assert.match(rendered, /Grace Hopper/);
  assert.match(rendered, /2026-07-18/);
});

test("interactive picker rejects non-TTY input with a CI-friendly message", async () => {
  const input = Object.assign(new PassThrough(), { isTTY: false });
  await assert.rejects(
    () => pickFlowAndVersions([], "My_Flow", input, new PassThrough()),
    /requires a TTY.*--from-version.*--to-version/,
  );
});

function flowVersion(versionNumber: number, developerName = "My_Flow"): FlowVersion {
  return {
    developerName,
    versionNumber,
    status: "Active",
    label: `Version ${versionNumber}`,
    lastModifiedBy: "Test User",
    lastModifiedDate: "2026-07-18",
  };
}

function fakeOrgModeDependencies(
  availableVersions: FlowVersion[],
  pickedVersions?: { developerName: string; fromVersion: number; toVersion: number },
): OrgModeDependencies & { calls: { picked: boolean; files?: string[] } } {
  const calls: { picked: boolean; files?: string[] } = { picked: false };
  return {
    calls,
    listFlowVersions: () => availableVersions,
    pickFlowAndVersions: async () => {
      calls.picked = true;
      return pickedVersions ?? { developerName: "My_Flow", fromVersion: 1, toVersion: 2 };
    },
    retrieveFlowVersions: (_org, developerName, selected) => ({
      workDir: "C:/temp/flow-delta-test",
      versions: selected.map((versionNumber) => ({
        versionNumber,
        path: `C:/temp/${developerName}-${versionNumber}.flow-meta.xml`,
      })),
      cleanup: () => undefined,
    }),
    runFileMode: async (oldPath, newPath) => {
      calls.files = [oldPath, newPath];
    },
  };
}

test("org mode dispatches pinned versions directly to file mode", async () => {
  const dependencies = fakeOrgModeDependencies([flowVersion(1), flowVersion(2)]);
  await runOrgMode(
    { org: "dev", flow: "My_Flow", "from-version": "1", "to-version": "2" },
    "C:/out",
    false,
    dependencies,
  );
  assert.equal(dependencies.calls.picked, false);
  assert.deepEqual(dependencies.calls.files, [
    "C:/temp/My_Flow-1.flow-meta.xml",
    "C:/temp/My_Flow-2.flow-meta.xml",
  ]);
});

test("org mode without a flow uses the picker before file mode", async () => {
  const dependencies = fakeOrgModeDependencies(
    [flowVersion(1), flowVersion(2)],
    { developerName: "My_Flow", fromVersion: 1, toVersion: 2 },
  );
  await runOrgMode({ org: "dev" }, "C:/out", false, dependencies);
  assert.equal(dependencies.calls.picked, true);
  assert.ok(dependencies.calls.files);
});

test("org mode reports unknown and missing Flow versions clearly", async () => {
  await assert.rejects(
    () => runOrgMode({ org: "dev", flow: "Missing", "from-version": "1", "to-version": "2" }, "C:/out", false, fakeOrgModeDependencies([])),
    /Flow Missing was not found/,
  );
  await assert.rejects(
    () => runOrgMode({ org: "dev", flow: "My_Flow", "from-version": "1", "to-version": "2" }, "C:/out", false, fakeOrgModeDependencies([flowVersion(1)])),
    /Flow My_Flow version 2 was not found/,
  );
  await assert.rejects(
    () => runOrgMode({ org: "dev", flow: "My_Flow", "from-version": "2", "to-version": "2" }, "C:/out", false, fakeOrgModeDependencies([flowVersion(2)])),
    /must be different flow versions/,
  );
});

test("org mode remaps the parser legacy-start error to an actionable message", async () => {
  const dependencies = fakeOrgModeDependencies([flowVersion(1), flowVersion(2)]);
  dependencies.runFileMode = async () => {
    throw new Error(ERROR_MESSAGES.flowStartNotDefined);
  };
  await assert.rejects(
    () => runOrgMode({ org: "dev", flow: "My_Flow", "from-version": "1", "to-version": "2" }, "C:/out", false, dependencies),
    /My_Flow version 1 or 2 uses the legacy Flow format/,
  );
});

test("sf runner gives actionable messages for missing CLI and auth failures", () => {
  assert.throws(
    () => runSfJson([], undefined, () => {
      throw Object.assign(new Error("spawn sf ENOENT"), { code: "ENOENT" });
    }),
    /Salesforce CLI.*not found/,
  );
  assert.throws(
    () => runSfJson([], undefined, () => {
      throw Object.assign(new Error("unauthorized"), { stderr: "No authorization information found" });
    }),
    /not authenticated.*sf.*sf org login web/,
  );
});
