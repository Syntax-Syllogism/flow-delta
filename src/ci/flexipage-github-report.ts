import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { isMainModule } from "../util/is-main-module.ts";
import { FLEXIPAGE_MARKER, buildFlexiPageComment, findStickyNote, isZeroPageSummary, loadArtifactUrls, readFlexiPageResults, resolveArtifactUrl, type FlexiPageResult } from "./report-core.ts";

export type { FlexiPageResult };
export const buildComment = buildFlexiPageComment;
export const isZeroSummary = isZeroPageSummary;
export interface GitHubComment { id:number; body:string; user?:{ login?:string } }
export interface FlexiPageGitHubEnv { apiUrl:string; owner:string; repo:string; prNumber:string; serverUrl:string; runId:string; token:string; commitSha?:string; marker?:string }

export function artifactUrl(env: Pick<FlexiPageGitHubEnv, "serverUrl" | "owner" | "repo" | "runId">): string { return `${env.serverUrl.replace(/\/+$/, "")}/${env.owner}/${env.repo}/actions/runs/${env.runId}`; }

export async function upsertComment(env: FlexiPageGitHubEnv, body: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const headers = { Authorization:`Bearer ${env.token}`, Accept:"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28", "Content-Type":"application/json" };
  const comments = await requestJson<GitHubComment[]>(fetchImpl, `${env.apiUrl}/repos/${env.owner}/${env.repo}/issues/${env.prNumber}/comments?per_page=100`, { headers });
  const sticky = findStickyNote(comments.map((comment) => ({ id:comment.id, body:comment.body })), env.marker ?? FLEXIPAGE_MARKER);
  await requestJson(fetchImpl, `${env.apiUrl}/repos/${env.owner}/${env.repo}/issues/${env.prNumber}/comments${sticky ? `/${sticky.id}` : ""}`, { method:sticky ? "PATCH" : "POST", headers, body:JSON.stringify({ body }) });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    const values = parseArgs({ args:argv, options:{ in:{type:"string"}, "api-url":{type:"string"}, repo:{type:"string"}, pr:{type:"string"}, "server-url":{type:"string"}, "run-id":{type:"string"}, token:{type:"string"}, "commit-sha":{type:"string"}, "artifact-urls":{type:"string"}, marker:{type:"string"}, help:{type:"boolean",short:"h"} }, allowPositionals:false }).values;
    if (values.help) { console.log("Usage: flexipage-delta-github --in <flexipage-delta-out> [...GitHub options]"); return; }
    const inputDir = values.in ?? process.env.FLOW_LENS_OUT_DIR ?? "./flexipage-delta-out";
    const records = readFlexiPageResults(inputDir);
    if (!records.length) return;
    const pr = typeof values.pr === "string" ? values.pr : resolvePrNumber();
    if (!pr) { console.error("No pull request number resolved; skipping GitHub comment."); return; }
    const env = resolveEnv(values, pr);
    const urls = loadArtifactUrls(typeof values["artifact-urls"] === "string" ? values["artifact-urls"] : undefined);
    const fallback = artifactUrl(env);
    const results = records.map((record) => ({ pageName:record.pageName, summary:record.summary, pageChanges:record.pageChanges, artifactUrl:resolveArtifactUrl(record.stem, urls, fallback) }));
    await upsertComment(env, buildFlexiPageComment(results, { marker:env.marker, commitSha:env.commitSha }));
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}

function resolvePrNumber(): string | undefined { const path = process.env.GITHUB_EVENT_PATH; if (!path) return undefined; try { const event = JSON.parse(readFileSync(path,"utf8")) as { pull_request?:{number?:number} }; return typeof event.pull_request?.number === "number" ? String(event.pull_request.number) : undefined; } catch { return undefined; } }
function resolveEnv(values: Record<string,string|boolean|undefined>, prNumber:string): FlexiPageGitHubEnv { const required=(value:string|boolean|undefined,name:string):string=>{if(typeof value!=="string"||!value)throw new Error(`Missing required value: ${name}`);return value;}; const full=required(values.repo??process.env.GITHUB_REPOSITORY,"GITHUB_REPOSITORY").split("/"); if(full.length!==2)throw new Error("Invalid repo (expected owner/repo)"); return { apiUrl:typeof(values["api-url"]??process.env.GITHUB_API_URL)==="string"?(values["api-url"]??process.env.GITHUB_API_URL) as string:"https://api.github.com", owner:full[0], repo:full[1], prNumber, serverUrl:typeof(values["server-url"]??process.env.GITHUB_SERVER_URL)==="string"?(values["server-url"]??process.env.GITHUB_SERVER_URL) as string:"https://github.com", runId:required(values["run-id"]??process.env.GITHUB_RUN_ID,"GITHUB_RUN_ID"), token:required(values.token??process.env.GITHUB_TOKEN,"GITHUB_TOKEN"), commitSha:typeof(values["commit-sha"]??process.env.GITHUB_SHA)==="string"?(values["commit-sha"]??process.env.GITHUB_SHA) as string:undefined, marker:typeof values.marker==="string"?values.marker:FLEXIPAGE_MARKER }; }
async function requestJson<T>(fetchImpl:typeof fetch,url:string,init:RequestInit):Promise<T>{const response=await fetchImpl(url,init);const body=await response.text();if(!response.ok)throw new Error(`${url} failed: ${response.status} ${body}`);return body?JSON.parse(body) as T:undefined as T;}
if (isMainModule(import.meta.url)) void main();
