import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const env = Object.freeze({})",
      };
    }
    return nextResolve(specifier, context);
  },
});

async function render(pathname = "/", options = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const origin = options.origin ?? "http://localhost";

  return worker.fetch(
    new Request(`${origin}${pathname}`, {
      ...(options.init ?? {}),
      headers: {
        accept: pathname === "/" ? "text/html" : "application/json",
        ...options.headers,
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the hosted Roughdraft collaboration shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Roughdraft community fork — Sites collaboration<\/title>/i,
  );
  assert.match(html, /HostedRoughdraft/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(
    html,
    /Private test snapshot|codex-preview|SkeletonPreview|taking shape/,
  );
});

test("reports the hosted collaboration capability boundary", async () => {
  const response = await render("/api/status");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.backend, "sites-hosted");
  assert.equal(payload.kind, "sites-hosted");
  assert.equal(payload.canonical, "hosted-record");
  assert.equal(payload.capabilities.sharedDocuments, true);
  assert.equal(payload.capabilities.reviewEvents, true);
  assert.equal(payload.capabilities.localFileSync, false);
});

test("protects document APIs when no authenticated viewer is forwarded", async () => {
  const response = await render("/api/document", {
    origin: "https://private.example",
  });
  assert.equal(response.status, 401);
});

test("rejects cross-origin hosted mutations before touching D1", async () => {
  const response = await render("/api/document", {
    origin: "https://private.example",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "reviewer@example.test",
      origin: "https://attacker.example",
    },
    init: {
      method: "PUT",
      body: JSON.stringify({
        content: "# Draft",
        expectedVersion: "d1:1",
      }),
    },
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "cross_origin_request_forbidden");
});

test("keeps the old source endpoint as a canonical export redirect", async () => {
  const response = await render("/api/source");
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/api/document/export",
  );
});
