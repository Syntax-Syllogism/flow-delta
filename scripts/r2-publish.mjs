#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [outDir = "flow-delta-out", keyPrefix = defaultKeyPrefix()] = process.argv.slice(2);

  try {
    const urls = publishDirectory(outDir, keyPrefix);
    process.stdout.write(`${JSON.stringify(urls, null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function publishDirectory(outDir, keyPrefix, env = process.env) {
  const bucket = required(env.R2_BUCKET, "R2_BUCKET");
  const endpoint = r2Endpoint(env);
  const htmlFiles = readdirSync(outDir).filter((file) => file.endsWith(".html")).sort();
  const urls = {};

  for (const file of htmlFiles) {
    const key = joinKey(keyPrefix, file);
    uploadHtml(join(outDir, file), bucket, key, endpoint);
    urls[file] = resolveUrl(bucket, key, endpoint, env);
  }

  return urls;
}

export function signedWorkerUrl(baseUrl, key, secret, exp) {
  const base = baseUrl.replace(/\/+$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const sig = hmacHex(secret, `${key}:${exp}`);
  return `${base}/${encodedKey}?exp=${exp}&sig=${sig}`;
}

export function hmacHex(secret, message) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function resolveUrl(bucket, key, endpoint, env) {
  if (env.ARTIFACT_BASE_URL) {
    const secret = required(env.ARTIFACT_HMAC_KEY, "ARTIFACT_HMAC_KEY");
    const exp = String(Math.floor(Date.now() / 1000) + expirySeconds(env));
    return signedWorkerUrl(env.ARTIFACT_BASE_URL, key, secret, exp);
  }

  return presignUrl(bucket, key, endpoint, expirySeconds(env));
}

function uploadHtml(path, bucket, key, endpoint) {
  runAws([
    "s3",
    "cp",
    path,
    `s3://${bucket}/${key}`,
    "--endpoint-url",
    endpoint,
    "--content-type",
    "text/html",
  ]);
}

function presignUrl(bucket, key, endpoint, expiresIn) {
  return runAws([
    "s3",
    "presign",
    `s3://${bucket}/${key}`,
    "--endpoint-url",
    endpoint,
    "--expires-in",
    String(expiresIn),
  ]);
}

function runAws(args) {
  const result = spawnSync("aws", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `aws ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function r2Endpoint(env) {
  const accountId = required(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID");
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function expirySeconds(env) {
  const raw = env.ARTIFACT_EXPIRES_IN_SECONDS ?? "86400";
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("ARTIFACT_EXPIRES_IN_SECONDS must be a positive integer");
  }
  return Math.min(value, 604800);
}

function joinKey(prefix, file) {
  return [prefix.replace(/^\/+|\/+$/g, ""), basename(file)].filter(Boolean).join("/");
}

function defaultKeyPrefix() {
  const repo = required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const sha = required(process.env.GITHUB_SHA, "GITHUB_SHA");
  const pr = process.env.GITHUB_PR_NUMBER ?? process.env.PR_NUMBER ?? readGitHubEventPrNumber() ?? "unknown-pr";
  return `${repo}/${pr}/${sha}`;
}

function readGitHubEventPrNumber() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }
  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    return typeof event?.number === "number" ? String(event.number) : undefined;
  } catch {
    return undefined;
  }
}

function required(value, name) {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}
