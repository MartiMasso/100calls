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

test("keeps the product flow unified, persistent, and bounded", async () => {
  const [page, css, route, workspaceRoute, campaignRoute, cronRoute, gmail, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/research/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/email/campaigns/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/email/cron/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/gmail.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260829103000_create_mission_workspaces.sql", import.meta.url), "utf8"),
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
  assert.match(css, /\.authorization-box[^}]*background: #14213d/);
  assert.doesNotMatch(css, /var\(--navy\)/);

  assert.match(route, /type ResearchStage = "plan" \| "refine" \| "contacts" \| "outreach"/);
  assert.match(route, /maxItems: 20/);
  assert.match(page, /Math\.min\(200/);
  assert.match(route, /web_search/);
  assert.match(page, /CONTEXT FOR OUTREACH/);
  assert.match(page, /Outreach settings/);
  assert.match(page, /LinkedIn connection note/);
  assert.match(page, /Public contact form/);
  assert.match(page, /one_hundred_calls_outreach_profile/);
  assert.match(route, /outreachDraftSchema/);
  assert.match(route, /Never infer email patterns/);
  assert.match(route, /linkedinConnectionLimit/);
  assert.match(gmail, /https:\/\/www\.100calls\.co\/api\/auth\/gmail\/callback/);
  assert.match(route, /contact_enrichment/);
  assert.match(route, /publicPhone/);
  assert.match(route, /websiteUrl/);
  assert.match(route, /cumulative fields, never competing alternatives/);
  assert.match(page, /Published office or business phone/);
  assert.match(page, /Plan email outreach/);
  assert.match(page, /const openEmailPlan/);
  assert.match(page, /contactsMissingEmail/);
  assert.doesNotMatch(page, /Find published emails for this pool/);
  assert.match(page, /emailSignature/);
  assert.match(page, /These emails have no sender signature/);
  assert.match(page, /Add sender details/);
  assert.match(page, /Your current sender signature will be added to every unsent draft/);
  assert.match(page, /Scheduled by 100 Calls, not Gmail/);
  assert.match(page, /Future emails do not appear in Gmail’s Scheduled folder/);
  assert.match(page, /campaignStatusLabel/);
  assert.match(page, /Cancel every email that has not started sending/);
  assert.match(page, /Delete draft/);
  assert.match(route, /Do not add a closing sign-off or sender signature/);
  assert.match(campaignRoute, /Add your sender name or email signature before authorizing this plan/);
  assert.match(campaignRoute, /appendEmailSignature\(email\.body, emailSignature\)/);
  assert.match(campaignRoute, /status: "in\.\(draft,queued\)"/);
  assert.match(campaignRoute, /status: "queued"/);
  assert.match(campaignRoute, /action === "delete"/);
  assert.match(campaignRoute, /Only draft email plans can be deleted/);
  assert.match(cronRoute, /one final chance to stop delivery/);
  assert.match(cronRoute, /finalCampaign\[0\]\?\.status !== "approved"/);

  assert.match(page, /fetch\("\/api\/workspace"/);
  assert.match(page, /All changes saved/);
  assert.match(page, /queueResearchPersistence\(missionResearch, true\)/);
  assert.match(page, /researchHydratedUserRef\.current === nextSession\.user\.id/);
  assert.match(page, /preserving progress while the strategy adapts/);
  assert.match(page, /stage: "refine"/);
  assert.doesNotMatch(page, /updateMissionResearch\(mission\.id, \(\) => emptyResearch\(\)\)/);
  assert.match(workspaceRoute, /export async function GET/);
  assert.match(workspaceRoute, /export async function POST/);
  assert.match(workspaceRoute, /auth\/v1\/user/);
  assert.match(workspaceRoute, /resolution=merge-duplicates/);
  assert.match(workspaceRoute, /user_id: auth\.userId/);
  assert.match(migration, /create table if not exists public\.mission_workspaces/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\)/);
});
