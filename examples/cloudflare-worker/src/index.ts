interface R2Object {
  body: string;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
}

export interface Env {
  BUCKET: R2Bucket;
  ARTIFACT_HMAC_KEY?: string;
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!key || key.includes("..")) {
      return new Response("Not found", { status: 404 });
    }

    if (env.ARTIFACT_HMAC_KEY) {
      const exp = Number(url.searchParams.get("exp"));
      const sig = url.searchParams.get("sig") ?? "";
      if (!exp || Math.floor(Date.now() / 1000) > exp) {
        return new Response("Link expired", { status: 403 });
      }
      const expected = await hmacHex(env.ARTIFACT_HMAC_KEY, `${key}:${exp}`);
      if (!timingSafeEqual(expected, sig)) {
        return new Response("Bad signature", { status: 403 });
      }
    }

    const obj = await env.BUCKET.get(key);
    if (!obj) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "private, max-age=300");
    return new Response(obj.body, { headers });
  },
};

export default worker;

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
