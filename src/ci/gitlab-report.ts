import { parseArgs } from "node:util";
import { isMainModule } from "../util/is-main-module.ts";
import {
  DEFAULT_MARKER,
  buildComment,
  findStickyNote,
  isZeroSummary,
  normalizePath,
  readResults,
  type FlowResult,
  type ReportNote,
} from "./report-core.ts";

export type { FlowResult };
export { buildComment, findStickyNote, isZeroSummary };
export type GitLabNote = ReportNote;

export interface GitLabReporterEnv {
  apiUrl: string;
  projectId: string;
  mergeRequestIid: string;
  projectUrl: string;
  jobId: string;
  token: string;
  commitSha?: string;
  marker?: string;
}

const REPORTER_USAGE = `Usage:
  flow-delta-gitlab --in <flow-delta-out> [--api-url <url>] [--project-id <id>] [--mr-iid <iid>]
                    [--project-url <url>] [--job-id <id>] [--token <token>] [--commit-sha <sha>]
`;

export function artifactUrl(env: Pick<GitLabReporterEnv, "projectUrl" | "jobId">, relPath: string, stem: string): string {
  const base = env.projectUrl.replace(/\/+$/, "");
  const relativePath = normalizePath(relPath);
  const encodedPath = [relativePath, `${stem}.html`]
    .filter(Boolean)
    .flatMap((segment) => segment.split("/").filter(Boolean))
    .map(encodeURIComponent)
    .join("/");

  return `${base}/-/jobs/${env.jobId}/artifacts/file/${encodedPath}`;
}

export async function upsertComment(
  env: GitLabReporterEnv,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const headers = {
    "PRIVATE-TOKEN": env.token,
    "Content-Type": "application/json",
  };
  const marker = env.marker ?? DEFAULT_MARKER;
  const user = await requestJson<{ id: number }>(fetchImpl, `${env.apiUrl}/user`, {
    headers,
  });
  const notes = await listNotes(fetchImpl, env, headers);
  const sticky = findStickyNote(notes, marker, user.id);
  const notePath = sticky ? `/notes/${sticky.id}` : "/notes";
  const method = sticky ? "PUT" : "POST";

  await requestJson(fetchImpl, `${env.apiUrl}/projects/${env.projectId}/merge_requests/${env.mergeRequestIid}${notePath}`, {
    method,
    headers,
    body: JSON.stringify({ body }),
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        in: { type: "string" },
        "api-url": { type: "string" },
        "project-id": { type: "string" },
        "mr-iid": { type: "string" },
        "project-url": { type: "string" },
        "job-id": { type: "string" },
        token: { type: "string" },
        "commit-sha": { type: "string" },
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

    const env = resolveEnv(parsed.values);
    const results = records.map((record) => ({
      flowName: record.flowName,
      summary: record.summary,
      flowChanges: record.flowChanges,
      artifactUrl: artifactUrl(env, inputDir, record.stem),
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

function resolveEnv(values: Record<string, string | boolean | undefined>): GitLabReporterEnv {
  const apiUrl = stringValue(values["api-url"] ?? process.env.CI_API_V4_URL, "CI_API_V4_URL");
  const projectId = stringValue(values["project-id"] ?? process.env.CI_PROJECT_ID, "CI_PROJECT_ID");
  const mergeRequestIid = stringValue(values["mr-iid"] ?? process.env.CI_MERGE_REQUEST_IID, "CI_MERGE_REQUEST_IID");
  const projectUrl = stringValue(values["project-url"] ?? process.env.CI_PROJECT_URL, "CI_PROJECT_URL");
  const jobId = stringValue(values["job-id"] ?? process.env.CI_JOB_ID, "CI_JOB_ID");
  const token = stringValue(values.token ?? process.env.FlowDelta_GITLAB_TOKEN, "FlowDelta_GITLAB_TOKEN");
  const commitSha = stringValueOptional(values["commit-sha"] ?? process.env.CI_COMMIT_SHA);
  const marker = stringValueOptional(values.marker) ?? DEFAULT_MARKER;

  return { apiUrl, projectId, mergeRequestIid, projectUrl, jobId, token, commitSha, marker };
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

async function listNotes(
  fetchImpl: typeof fetch,
  env: GitLabReporterEnv,
  headers: Record<string, string>,
): Promise<ReportNote[]> {
  const notes: ReportNote[] = [];
  let page = 1;

  while (true) {
    const response = await fetchImpl(
      `${env.apiUrl}/projects/${env.projectId}/merge_requests/${env.mergeRequestIid}/notes?per_page=100&page=${page}`,
      { headers },
    );
    const pageNotes = await parseResponse<ReportNote[]>(response, "list MR notes");
    notes.push(...pageNotes);
    if (pageNotes.length < 100) {
      return notes;
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
