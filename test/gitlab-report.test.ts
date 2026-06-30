import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactUrl, buildComment, findStickyNote, upsertComment, type FlowResult } from "../src/ci/gitlab-report.ts";

test("artifactUrl builds the GitLab artifact browse URL", () => {
  const url = artifactUrl(
    {
      projectUrl: "https://gitlab.example.com/group/project/",
      jobId: "123",
    },
    "flow-delta-out",
    "TA_Case_InsertAuroraTag",
  );

  assert.equal(
    url,
    "https://gitlab.example.com/group/project/-/jobs/123/artifacts/file/flow-delta-out/TA_Case_InsertAuroraTag.html",
  );
});

test("buildComment renders a marker, table, escaped flow names, and commit footer", () => {
  const results: FlowResult[] = [
    {
      flowName: "TA | Case | InsertAuroraTag",
      summary: { addedNodes: 1, removedNodes: 0, modifiedNodes: 2, addedEdges: 3, removedEdges: 4 },
      artifactUrl: "https://example.test/one",
    },
    {
      flowName: "Another Flow",
      summary: { addedNodes: 0, removedNodes: 1, modifiedNodes: 0, addedEdges: 0, removedEdges: 1 },
      artifactUrl: "https://example.test/two",
    },
  ];

  const comment = buildComment(results, { commitSha: "abcdef1234567890" });

  assert.match(comment, /^<!-- FlowDelta:report -->/);
  assert.match(comment, /## 🔍 FlowDelta — 2 flow\(s\) changed/);
  assert.match(comment, /\| Flow \| \+nodes \| -nodes \| ~nodes \| \+\/-edges \| Diff \|/);
  assert.match(comment, /\| TA \\| Case \\| InsertAuroraTag \| 1 \| 0 \| 2 \| 3 \/ 4 \| \[Open interactive diff ▸\]\(https:\/\/example\.test\/one\) \|/);
  assert.match(comment, /\| Another Flow \| 0 \| 1 \| 0 \| 0 \/ 1 \| \[Open interactive diff ▸\]\(https:\/\/example\.test\/two\) \|/);
  assert.match(comment, /Commit: `abcdef1`/);
});

test("buildComment renders the empty-state message when there are no changed flows", () => {
  const comment = buildComment([]);
  assert.match(comment, /No Flow changes in this MR/);
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

test("upsertComment updates an existing sticky note when present", async () => {
  const requests: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];
  const fetchImpl = async (input: string | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    requests.push({
      url: String(input),
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    });

    if (String(input).endsWith("/user")) {
      return jsonResponse({ id: 42 });
    }
    if (String(input).includes("/notes?")) {
      return jsonResponse([{ id: 7, body: "<!-- FlowDelta:report -->\nold", author: { id: 42 } }]);
    }
    return jsonResponse({ id: 7 });
  };

  await upsertComment(
    {
      apiUrl: "https://gitlab.example.com/api/v4",
      projectId: "1",
      mergeRequestIid: "2",
      projectUrl: "https://gitlab.example.com/group/project",
      jobId: "3",
      token: "secret",
      marker: "<!-- FlowDelta:report -->",
    },
    "new body",
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(
    requests.map((request) => ({ url: request.url, method: request.method, token: request.headers.get("PRIVATE-TOKEN") })),
    [
      { url: "https://gitlab.example.com/api/v4/user", method: "GET", token: "secret" },
      {
        url: "https://gitlab.example.com/api/v4/projects/1/merge_requests/2/notes?per_page=100&page=1",
        method: "GET",
        token: "secret",
      },
      { url: "https://gitlab.example.com/api/v4/projects/1/merge_requests/2/notes/7", method: "PUT", token: "secret" },
    ],
  );
  assert.equal(JSON.parse(requests[2].body ?? "{}").body, "new body");
});

test("upsertComment creates a sticky note when none exists", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const fetchImpl = async (input: string | URL, init: RequestInit = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? "GET",
    });

    if (String(input).endsWith("/user")) {
      return jsonResponse({ id: 42 });
    }
    if (String(input).includes("/notes?")) {
      return jsonResponse([{ id: 7, body: "noise", author: { id: 42 } }]);
    }
    return jsonResponse({ id: 8 });
  };

  await upsertComment(
    {
      apiUrl: "https://gitlab.example.com/api/v4",
      projectId: "1",
      mergeRequestIid: "2",
      projectUrl: "https://gitlab.example.com/group/project",
      jobId: "3",
      token: "secret",
      marker: "<!-- FlowDelta:report -->",
    },
    "new body",
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(requests, [
    { url: "https://gitlab.example.com/api/v4/user", method: "GET" },
    { url: "https://gitlab.example.com/api/v4/projects/1/merge_requests/2/notes?per_page=100&page=1", method: "GET" },
    { url: "https://gitlab.example.com/api/v4/projects/1/merge_requests/2/notes", method: "POST" },
  ]);
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
  });
  assert.ok(packageJson.files?.includes("dist"));
  assert.ok(packageJson.files?.includes("NOTICE"));
  assert.ok(packageJson.files?.includes("LICENSE"));
  assert.ok(packageJson.files?.includes("LICENSE-APACHE"));

  const cliBundle = readFileSync(join(process.cwd(), "dist", "cli.js"), "utf8");
  const reporterBundle = readFileSync(join(process.cwd(), "dist", "gitlab-report.js"), "utf8");
  assert.ok(cliBundle.startsWith("#!/usr/bin/env node"));
  assert.ok(reporterBundle.startsWith("#!/usr/bin/env node"));

  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    const { main: cliMain } = await import(pathToFileURL(join(process.cwd(), "dist", "cli.js")).href);
    const { main: reporterMain } = await import(pathToFileURL(join(process.cwd(), "dist", "gitlab-report.js")).href);
    await cliMain(["--help"]);
    await reporterMain(["--help"]);
  } finally {
    console.log = originalLog;
  }

  assert.ok(logs.some((line) => line.includes("flow-delta --old")));
  assert.ok(logs.some((line) => line.includes("flow-delta-gitlab --in")));
});

test("published bins execute through npm-style symlinks", async () => {
  await import(pathToFileURL(join(process.cwd(), "scripts/build.mjs")).href);

  const binDir = mkdtempSync(join(tmpdir(), "flow-delta-bin-"));
  const cliBin = join(binDir, "flow-delta");
  const reporterBin = join(binDir, "flow-delta-gitlab");
  linkBin(join(process.cwd(), "dist", "cli.js"), cliBin);
  linkBin(join(process.cwd(), "dist", "gitlab-report.js"), reporterBin);

  assert.match(execFileSync(process.execPath, [cliBin, "--help"], { encoding: "utf8" }), /flow-delta --old/);
  assert.match(execFileSync(process.execPath, [reporterBin, "--help"], { encoding: "utf8" }), /flow-delta-gitlab --in/);
});

test("sample GitLab job preserves shell line continuations", () => {
  const config = readFileSync(join(process.cwd(), "examples", "gitlab-ci.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(config, /script:\n    - \|\n      npx .* flow-delta \\\n/);
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
