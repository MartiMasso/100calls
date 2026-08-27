import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 100 Calls application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>100 Calls · Talk to the people who truly matter<\/title>/i);
  assert.match(html, /100/);
  assert.match(html, /CALLS/);
  assert.match(html, /Loading your workspace/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("keeps the product flow unified and the research pipeline bounded", async () => {
  const [page, css, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/research/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function MissionWorkspace/);
  assert.match(page, /LIVING CONTACT STRATEGY/);
  assert.match(page, /CANDIDATE POOL/);
  assert.match(page, /Build first 50 candidates/);
  assert.match(page, /Expand list/);
  assert.match(page, /Save & update strategy/);
  assert.doesNotMatch(page, /const tabs:/);

  assert.match(css, /\.mission-flow/);
  assert.match(css, /\.strategy-route/);
  assert.match(css, /\.candidate-row/);

  assert.match(route, /type ResearchStage = "plan" \| "refine" \| "contacts"/);
  assert.match(route, /maxItems: 20/);
  assert.match(page, /Math\.min\(200/);
  assert.match(route, /web_search/);
});
