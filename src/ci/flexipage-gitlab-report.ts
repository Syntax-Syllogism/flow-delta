import { parseArgs } from "node:util";
import { isMainModule } from "../util/is-main-module.ts";
import { FLEXIPAGE_MARKER, buildFlexiPageComment, findStickyNote, isZeroPageSummary, normalizePath, readFlexiPageResults, type FlexiPageResult, type ReportNote } from "./report-core.ts";

export type { FlexiPageResult };
export const buildComment = buildFlexiPageComment;
export const isZeroSummary = isZeroPageSummary;
export type GitLabNote = ReportNote;

export interface FlexiPageGitLabEnv { apiUrl:string; projectId:string; mergeRequestIid:string; projectUrl:string; jobId:string; token:string; commitSha?:string; marker?:string; }

export function artifactUrl(env: Pick<FlexiPageGitLabEnv, "projectUrl" | "jobId">, relPath: string, stem: string): string {
  const base = env.projectUrl.replace(/\/+$/, "");
  const path = [normalizePath(relPath), `${stem}.html`].filter(Boolean).flatMap((part) => part.split("/").filter(Boolean)).map(encodeURIComponent).join("/");
  return `${base}/-/jobs/${env.jobId}/artifacts/file/${path}`;
}

export async function upsertComment(env: FlexiPageGitLabEnv, body: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const headers = { "PRIVATE-TOKEN": env.token, "Content-Type": "application/json" };
  const user = await requestJson<{ id:number }>(fetchImpl, `${env.apiUrl}/user`, { headers });
  const notes = await requestJson<ReportNote[]>(fetchImpl, `${env.apiUrl}/projects/${env.projectId}/merge_requests/${env.mergeRequestIid}/notes?per_page=100`, { headers });
  const marker = env.marker ?? FLEXIPAGE_MARKER;
  const sticky = findStickyNote(notes, marker, user.id);
  await requestJson(fetchImpl, `${env.apiUrl}/projects/${env.projectId}/merge_requests/${env.mergeRequestIid}${sticky ? `/notes/${sticky.id}` : "/notes"}`, { method: sticky ? "PUT" : "POST", headers, body: JSON.stringify({ body }) });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const values = parseArgs({ args: argv, options: { in:{type:"string"}, "api-url":{type:"string"}, "project-id":{type:"string"}, "mr-iid":{type:"string"}, "project-url":{type:"string"}, "job-id":{type:"string"}, token:{type:"string"}, "commit-sha":{type:"string"}, marker:{type:"string"}, help:{type:"boolean",short:"h"} }, allowPositionals:false }).values;
    if (values.help) { console.log("Usage: flexipage-delta-gitlab --in <flexipage-delta-out> [...GitLab options]"); return; }
    const inputDir = values.in ?? process.env.FLOW_LENS_OUT_DIR ?? "./flexipage-delta-out";
    const records = readFlexiPageResults(inputDir);
    if (!records.length) return;
    const env = resolveEnv(values);
    const results = records.map((record) => ({ pageName: record.pageName, summary: record.summary, pageChanges: record.pageChanges, artifactUrl: artifactUrl(env, inputDir, record.stem) }));
    await upsertComment(env, buildFlexiPageComment(results, { marker: env.marker, commitSha: env.commitSha }));
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}

function resolveEnv(values: Record<string, string | boolean | undefined>): FlexiPageGitLabEnv {
  const required = (value: string | boolean | undefined, name: string): string => { if (typeof value !== "string" || !value) throw new Error(`Missing required value: ${name}`); return value; };
  const commitSha = values["commit-sha"] ?? process.env.CI_COMMIT_SHA;
  return { apiUrl:required(values["api-url"] ?? process.env.CI_API_V4_URL,"CI_API_V4_URL"), projectId:required(values["project-id"] ?? process.env.CI_PROJECT_ID,"CI_PROJECT_ID"), mergeRequestIid:required(values["mr-iid"] ?? process.env.CI_MERGE_REQUEST_IID,"CI_MERGE_REQUEST_IID"), projectUrl:required(values["project-url"] ?? process.env.CI_PROJECT_URL,"CI_PROJECT_URL"), jobId:required(values["job-id"] ?? process.env.CI_JOB_ID,"CI_JOB_ID"), token:required(values.token ?? process.env.FlowDelta_GITLAB_TOKEN,"FlowDelta_GITLAB_TOKEN"), commitSha:typeof commitSha === "string" ? commitSha : undefined, marker:typeof values.marker === "string" ? values.marker : FLEXIPAGE_MARKER };
}

async function requestJson<T>(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<T> { const response = await fetchImpl(url, init); const body = await response.text(); if (!response.ok) throw new Error(`${url} failed: ${response.status} ${body}`); return body ? JSON.parse(body) as T : undefined as T; }
if (isMainModule(import.meta.url)) void main();
