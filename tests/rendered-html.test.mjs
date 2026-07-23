import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Japanese scanner shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /lang="ja"/);
  assert.match(html, /<title>アミノずかんカメラ<\/title>/);
  assert.match(html, /カメラをはじめる/);
  assert.match(html, /写真からしらべる/);
  assert.match(html, /カメラの映像は、ふだん端末の中だけで調べます/);
  assert.match(html, /aria-label="調べる写真をえらぶ"/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
  assert.doesNotMatch(html, /codex-preview/);
});
