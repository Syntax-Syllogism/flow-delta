import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactUrl, upsertComment } from "../src/ci/gitlab-report.ts";

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

test("sample GitLab job preserves shell line continuations", () => {
  const config = readFileSync(join(process.cwd(), "examples", "gitlab-ci.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(config, /script:\n    - \|\n(?:      #.*\n)*      npx .* flow-delta \\\n/);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
