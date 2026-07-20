import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactUrl, main, upsertComment } from "../src/ci/github-report.ts";

test("artifactUrl builds the run-artifacts page URL", () => {
  const url = artifactUrl({
    serverUrl: "https://github.com/",
    owner: "acme",
    repo: "flow-lens",
    runId: "123",
  });

  assert.equal(url, "https://github.com/acme/flow-lens/actions/runs/123");
});

test("upsertComment PATCHes an existing sticky comment when present", async () => {
  const requests: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];
  const fetchImpl = async (input: string | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    requests.push({
      url: String(input),
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    });

    if (String(input).includes("/issues/2/comments?")) {
      return jsonResponse([{ id: 7, body: "<!-- FlowDelta:report -->\nold" }]);
    }
    return jsonResponse({ id: 7 });
  };

  await upsertComment(
    {
      apiUrl: "https://api.github.com",
      owner: "acme",
      repo: "flow-lens",
      prNumber: "2",
      serverUrl: "https://github.com",
      runId: "3",
      token: "secret",
      marker: "<!-- FlowDelta:report -->",
    },
    "new body",
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(
    requests.map((request) => ({ url: request.url, method: request.method, auth: request.headers.get("Authorization") })),
    [
      { url: "https://api.github.com/repos/acme/flow-lens/issues/2/comments?per_page=100&page=1", method: "GET", auth: "Bearer secret" },
      { url: "https://api.github.com/repos/acme/flow-lens/issues/comments/7", method: "PATCH", auth: "Bearer secret" },
    ],
  );
  assert.equal(JSON.parse(requests[1].body ?? "{}").body, "new body");
  assert.ok(!requests.some((request) => request.url.endsWith("/user")));
});

test("upsertComment POSTs a new sticky comment when none exists", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const fetchImpl = async (input: string | URL, init: RequestInit = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? "GET",
    });

    if (String(input).includes("/issues/2/comments?")) {
      return jsonResponse([{ id: 7, body: "noise" }]);
    }
    return jsonResponse({ id: 8 });
  };

  await upsertComment(
    {
      apiUrl: "https://api.github.com",
      owner: "acme",
      repo: "flow-lens",
      prNumber: "2",
      serverUrl: "https://github.com",
      runId: "3",
      token: "secret",
      marker: "<!-- FlowDelta:report -->",
    },
    "new body",
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(requests, [
    { url: "https://api.github.com/repos/acme/flow-lens/issues/2/comments?per_page=100&page=1", method: "GET" },
    { url: "https://api.github.com/repos/acme/flow-lens/issues/2/comments", method: "POST" },
  ]);
});

test("sample GitHub workflow grants pull-requests write and uploads the artifact", () => {
  const config = readFileSync(join(process.cwd(), "examples", "github-actions.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(config, /on: pull_request/);
  assert.match(config, /pull-requests: write/);
  assert.match(config, /actions\/upload-artifact@v4/);
  assert.match(config, /flow-delta-github --in flow-delta-out/);
});

test("main() resolves the PR number from GITHUB_EVENT_PATH and posts a comment", async () => {
  const inputDir = writeFixtureDir({
    "flow.diff.json": diffFixture({ addedNodes: 1 }),
  });
  const eventPath = writeEventFile({ pull_request: { number: 42 } });
  const requests: Array<{ url: string; method: string }> = [];

  await withEnv(
    {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "acme/flow-lens",
      GITHUB_RUN_ID: "9",
      GITHUB_TOKEN: "secret",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_API_URL: "https://api.github.com",
    },
    () =>
      withFetch(async (input, init = {}) => {
        requests.push({ url: String(input), method: init.method ?? "GET" });
        if (String(input).includes("/comments?")) {
          return jsonResponse([]);
        }
        return jsonResponse({ id: 1 });
      }, () => runMain(["--in", inputDir])),
  );

  assert.deepEqual(requests, [
    { url: "https://api.github.com/repos/acme/flow-lens/issues/42/comments?per_page=100&page=1", method: "GET" },
    { url: "https://api.github.com/repos/acme/flow-lens/issues/42/comments", method: "POST" },
  ]);
});

test("main() resolves the PR number from --pr when there is no event payload", async () => {
  const inputDir = writeFixtureDir({
    "flow.diff.json": diffFixture({ addedNodes: 1 }),
  });
  const requests: Array<{ url: string }> = [];

  await withEnv(
    {
      GITHUB_EVENT_PATH: undefined,
      GITHUB_REPOSITORY: "acme/flow-lens",
      GITHUB_RUN_ID: "9",
      GITHUB_TOKEN: "secret",
    },
    () =>
      withFetch(async (input) => {
        requests.push({ url: String(input) });
        if (String(input).includes("/comments?")) {
          return jsonResponse([]);
        }
        return jsonResponse({ id: 1 });
      }, () => runMain(["--in", inputDir, "--pr", "7"])),
  );

  assert.ok(requests.some((request) => request.url.includes("/issues/7/comments")));
});

test("main() no-ops when no PR number can be resolved", async () => {
  const inputDir = writeFixtureDir({
    "flow.diff.json": diffFixture({ addedNodes: 1 }),
  });
  let fetchCalls = 0;

  await withEnv(
    {
      GITHUB_EVENT_PATH: undefined,
      GITHUB_REPOSITORY: "acme/flow-lens",
      GITHUB_RUN_ID: "9",
      GITHUB_TOKEN: "secret",
    },
    () =>
      withFetch(async () => {
        fetchCalls += 1;
        return jsonResponse({});
      }, () => runMain(["--in", inputDir])),
  );

  assert.equal(fetchCalls, 0);
});

test("main() no-ops when there are no changed diffs", async () => {
  const inputDir = writeFixtureDir({
    "flow.diff.json": diffFixture({}),
  });
  const eventPath = writeEventFile({ pull_request: { number: 42 } });
  let fetchCalls = 0;

  await withEnv(
    {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "acme/flow-lens",
      GITHUB_RUN_ID: "9",
      GITHUB_TOKEN: "secret",
    },
    () =>
      withFetch(async () => {
        fetchCalls += 1;
        return jsonResponse({});
      }, () => runMain(["--in", inputDir])),
  );

  assert.equal(fetchCalls, 0);
});

test("main() posts a comment for an attribute-only diff (no node/edge changes)", async () => {
  const inputDir = writeFixtureDir({
    "flow.diff.json": diffFixture(
      { changedFlowAttributes: 1 },
      [{ path: "status", before: "Active", after: "Draft" }],
    ),
  });
  const eventPath = writeEventFile({ pull_request: { number: 42 } });
  const requests: Array<{ url: string; method: string; body?: string }> = [];

  await withEnv(
    {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "acme/flow-lens",
      GITHUB_RUN_ID: "9",
      GITHUB_TOKEN: "secret",
    },
    () =>
      withFetch(async (input, init = {}) => {
        requests.push({
          url: String(input),
          method: init.method ?? "GET",
          body: typeof init.body === "string" ? init.body : undefined,
        });
        if (String(input).includes("/comments?")) {
          return jsonResponse([]);
        }
        return jsonResponse({ id: 1 });
      }, () => runMain(["--in", inputDir])),
  );

  const posted = requests.find((request) => request.method === "POST");
  assert.ok(posted);
  assert.match(JSON.parse(posted?.body ?? "{}").body, /\+0 \/ −0 \/ ~1 \| \[View\]/);
});

test("main() links a provided artifact URL manifest entry when available", async () => {
  const inputDir = writeFixtureDir({
    "flow.diff.json": diffFixture({ addedNodes: 1 }),
  });
  const urlsPath = join(inputDir, "urls.json");
  writeFileSync(urlsPath, JSON.stringify({ "Test_Flow.html": "https://worker.example/Test_Flow.html" }), "utf8");
  const eventPath = writeEventFile({ pull_request: { number: 42 } });
  const requests: Array<{ method: string; body?: string }> = [];

  await withEnv(
    {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "acme/flow-lens",
      GITHUB_RUN_ID: "9",
      GITHUB_TOKEN: "secret",
    },
    () =>
      withFetch(async (_input, init = {}) => {
        requests.push({
          method: init.method ?? "GET",
          body: typeof init.body === "string" ? init.body : undefined,
        });
        if ((init.method ?? "GET") === "GET") {
          return jsonResponse([]);
        }
        return jsonResponse({ id: 1 });
      }, () => runMain(["--in", inputDir, "--artifact-urls", urlsPath])),
  );

  const posted = requests.find((request) => request.method === "POST");
  assert.ok(posted);
  assert.match(JSON.parse(posted.body ?? "{}").body, /https:\/\/worker\.example\/Test_Flow\.html/);
  assert.doesNotMatch(JSON.parse(posted.body ?? "{}").body, /actions\/runs\/9/);
});

function writeFixtureDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "flow-delta-github-out-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(contents), "utf8");
  }
  return dir;
}

function diffFixture(
  summaryOverrides: Partial<{
    addedNodes: number;
    removedNodes: number;
    modifiedNodes: number;
    addedEdges: number;
    removedEdges: number;
    changedFlowAttributes: number;
  }>,
  flowChanges?: Array<{ path: string; before: unknown; after: unknown }>,
): unknown {
  return {
    flowName: "Test Flow",
    summary: {
      addedNodes: 0,
      removedNodes: 0,
      modifiedNodes: 0,
      unchangedNodes: 0,
      addedEdges: 0,
      removedEdges: 0,
      changedFlowAttributes: 0,
      ...summaryOverrides,
    },
    ...(flowChanges ? { flowChanges } : {}),
    nodes: [],
    edges: [],
  };
}

function writeEventFile(event: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "flow-delta-github-event-"));
  const path = join(dir, "event.json");
  writeFileSync(path, JSON.stringify(event), "utf8");
  return path;
}

async function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
  }
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function runMain(args: string[]): Promise<void> {
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await main(args);
    assert.notEqual(process.exitCode, 1, "main() reported a reporter error");
  } finally {
    process.exitCode = previousExitCode;
  }
}

async function withFetch(
  mock: (input: string | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
