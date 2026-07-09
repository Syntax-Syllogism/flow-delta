import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { isMainModule } from "../util/is-main-module.ts";
import {
  DEFAULT_MARKER,
  buildComment,
  findStickyNote,
  isZeroSummary,
  loadArtifactUrls,
  readResults,
  resolveArtifactUrl,
  type FlowResult,
} from "./report-core.ts";

export type { FlowResult };
export { buildComment, findStickyNote, isZeroSummary };

export interface GitHubComment {
  id: number;
  body: string;
  user?: {
    login?: string;
  };
}

export interface GitHubReporterEnv {
  apiUrl: string;
  owner: string;
  repo: string;
  prNumber: string;
  serverUrl: string;
  runId: string;
  token: string;
  commitSha?: string;
  marker?: string;
}

const REPORTER_USAGE = `Usage:
  flow-delta-github --in <flow-delta-out> [--api-url <url>] [--repo <owner/repo>] [--pr <number>]
                    [--server-url <url>] [--run-id <id>] [--token <token>] [--commit-sha <sha>]
                    [--artifact-urls <manifest.json>]
`;

export function artifactUrl(env: Pick<GitHubReporterEnv, "serverUrl" | "owner" | "repo" | "runId">): string {
  const base = env.serverUrl.replace(/\/+$/, "");
  return `${base}/${env.owner}/${env.repo}/actions/runs/${env.runId}`;
}

export async function upsertComment(
  env: GitHubReporterEnv,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${env.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const marker = env.marker ?? DEFAULT_MARKER;
  const comments = await listComments(fetchImpl, env, headers);
  const sticky = findStickyNote(
    comments.map((comment) => ({ id: comment.id, body: comment.body })),
    marker,
  );

  if (sticky) {
    await requestJson(fetchImpl, `${env.apiUrl}/repos/${env.owner}/${env.repo}/issues/comments/${sticky.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ body }),
    });
  } else {
    await requestJson(fetchImpl, `${env.apiUrl}/repos/${env.owner}/${env.repo}/issues/${env.prNumber}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
    });
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        in: { type: "string" },
        "api-url": { type: "string" },
        repo: { type: "string" },
        pr: { type: "string" },
        "server-url": { type: "string" },
        "run-id": { type: "string" },
        token: { type: "string" },
        "commit-sha": { type: "string" },
        "artifact-urls": { type: "string" },
        marker: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    });

    if (parsed.values.help) {
      console.log(REPORTER_USAGE.trimEnd());
      return;
    }

    const inputDir = parsed.values.in ?? process.env.FLOW_LENS_OUT_DIR ?? "./flow-delta-out";
    const records = readResults(inputDir);
    if (records.length === 0) {
      return;
    }

    const prNumber = resolvePrNumber(parsed.values);
    if (prNumber === undefined) {
      console.error("No pull request number resolved (not a pull_request event); skipping GitHub comment.");
      return;
    }

    const env = resolveEnv(parsed.values, prNumber);
    const urls = loadArtifactUrls(stringValueOptional(parsed.values["artifact-urls"]));
    const fallbackUrl = artifactUrl(env);
    const results = records.map((record) => ({
      flowName: record.flowName,
      summary: record.summary,
      flowChanges: record.flowChanges,
      artifactUrl: resolveArtifactUrl(record.stem, urls, fallbackUrl),
    }));

    const body = buildComment(results, {
      marker: env.marker,
      commitSha: env.commitSha,
    });
    await upsertComment(env, body);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

function resolvePrNumber(values: Record<string, string | boolean | undefined>): string | undefined {
  const fromFlag = stringValueOptional(values.pr);
  if (fromFlag) {
    return fromFlag;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }

  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8")) as { pull_request?: { number?: number } };
    const number = event.pull_request?.number;
    return typeof number === "number" ? String(number) : undefined;
  } catch {
    return undefined;
  }
}

function resolveEnv(values: Record<string, string | boolean | undefined>, prNumber: string): GitHubReporterEnv {
  const apiUrl = stringValueOptional(values["api-url"] ?? process.env.GITHUB_API_URL) ?? "https://api.github.com";
  const repoFull = stringValue(values.repo ?? process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo (expected owner/repo): ${repoFull}`);
  }
  const serverUrl = stringValueOptional(values["server-url"] ?? process.env.GITHUB_SERVER_URL) ?? "https://github.com";
  const runId = stringValue(values["run-id"] ?? process.env.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  const token = stringValue(values.token ?? process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const commitSha = stringValueOptional(values["commit-sha"] ?? process.env.GITHUB_SHA);
  const marker = stringValueOptional(values.marker) ?? DEFAULT_MARKER;

  return { apiUrl, owner, repo, prNumber, serverUrl, runId, token, commitSha, marker };
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

async function listComments(
  fetchImpl: typeof fetch,
  env: GitHubReporterEnv,
  headers: Record<string, string>,
): Promise<GitHubComment[]> {
  const comments: GitHubComment[] = [];
  let page = 1;

  while (true) {
    const response = await fetchImpl(
      `${env.apiUrl}/repos/${env.owner}/${env.repo}/issues/${env.prNumber}/comments?per_page=100&page=${page}`,
      { headers },
    );
    const pageComments = await parseResponse<GitHubComment[]>(response, "list PR comments");
    comments.push(...pageComments);
    if (pageComments.length < 100) {
      return comments;
    }
    page += 1;
  }
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  label = url,
): Promise<T> {
  const response = await fetchImpl(url, init);
  return parseResponse<T>(response, label);
}

async function parseResponse<T>(response: Response, label: string): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${body}`);
  }
  return body.length > 0 ? (JSON.parse(body) as T) : (undefined as T);
}

if (isMainModule(import.meta.url)) {
  void main();
}
