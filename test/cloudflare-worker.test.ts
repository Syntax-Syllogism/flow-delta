import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../examples/cloudflare-worker/src/index.ts";
import { hmacHex } from "../scripts/r2-publish.mjs";

test("Cloudflare Worker serves signed HTML with text/html content type", async () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const key = "owner/repo/12/abc/Test_Flow.html";
  const sig = hmacHex("secret", `${key}:${exp}`);

  const response = await worker.fetch(
    new Request(`https://worker.example/${key}?exp=${exp}&sig=${sig}`),
    envWithObject("<!doctype html>"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await response.text(), "<!doctype html>");
});

test("Cloudflare Worker rejects expired and tampered signatures", async () => {
  const key = "owner/repo/12/abc/Test_Flow.html";
  const expired = Math.floor(Date.now() / 1000) - 1;
  const goodExp = Math.floor(Date.now() / 1000) + 60;

  const expiredResponse = await worker.fetch(
    new Request(`https://worker.example/${key}?exp=${expired}&sig=${hmacHex("secret", `${key}:${expired}`)}`),
    envWithObject("<!doctype html>"),
  );
  const tamperedResponse = await worker.fetch(
    new Request(`https://worker.example/${key}?exp=${goodExp}&sig=bad`),
    envWithObject("<!doctype html>"),
  );

  assert.equal(expiredResponse.status, 403);
  assert.equal(await expiredResponse.text(), "Link expired");
  assert.equal(tamperedResponse.status, 403);
  assert.equal(await tamperedResponse.text(), "Bad signature");
});

test("Cloudflare Worker returns 404 for missing objects", async () => {
  const key = "owner/repo/12/abc/Missing.html";
  const exp = Math.floor(Date.now() / 1000) + 60;
  const sig = hmacHex("secret", `${key}:${exp}`);

  const response = await worker.fetch(new Request(`https://worker.example/${key}?exp=${exp}&sig=${sig}`), {
    ARTIFACT_HMAC_KEY: "secret",
    BUCKET: {
      get: async () => null,
    },
  } as unknown as never);

  assert.equal(response.status, 404);
});

function envWithObject(body: string) {
  return {
    ARTIFACT_HMAC_KEY: "secret",
    BUCKET: {
      get: async () => ({
        body,
        writeHttpMetadata(headers: Headers) {
          headers.set("content-type", "application/octet-stream");
        },
      }),
    },
  } as unknown as never;
}
