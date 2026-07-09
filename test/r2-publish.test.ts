import { test } from "node:test";
import assert from "node:assert/strict";
import { hmacHex, signedWorkerUrl } from "../scripts/r2-publish.mjs";

test("hmacHex matches the SHA-256 HMAC known vector", () => {
  assert.equal(
    hmacHex("key", "The quick brown fox jumps over the lazy dog"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
});

test("signedWorkerUrl signs key and expiry with the worker message format", () => {
  const url = signedWorkerUrl("https://worker.example/", "owner/repo/12/abc/Test Flow.html", "secret", "1710000000");

  assert.equal(
    url,
    "https://worker.example/owner/repo/12/abc/Test%20Flow.html?exp=1710000000&sig=e3290991e1ad572687653b9cc17552b6295b2cff8ef32f549a2292a9c875c566",
  );
});
