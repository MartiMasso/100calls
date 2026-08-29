import { adminFetch, authenticateRequest, readAdminJson } from "@/lib/server/supabase-admin";
import { decryptRefreshToken, revokeGoogleToken } from "@/lib/server/gmail";

type CampaignRow = {
  id: string;
  mission_id: string;
  name: string;
  status: string;
  timezone: string;
  daily_limit: number;
  approved_at: string | null;
  created_at: string;
};

type ScheduledEmailRow = {
  id: string;
  campaign_id: string;
  contact_id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  scheduled_at: string;
  status: string;
  last_error: string | null;
  sent_at: string | null;
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanEmail(value: unknown): string {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function validUuid(value: unknown): string {
  const id = cleanText(value, 50);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

async function connectionFor(userId: string) {
  const query = new URLSearchParams({ select: "email,status,connected_at", user_id: `eq.${userId}`, limit: "1" });
  const rows = await readAdminJson<Array<{ email: string; status: string; connected_at: string }>>(
    await adminFetch(`gmail_connections?${query}`),
    "Gmail connection status could not be loaded.",
  );
  const row = rows[0];
  return row?.status === "connected" ? { connected: true, email: row.email, connectedAt: row.connected_at } : { connected: false, email: "", connectedAt: "" };
}

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request);
    if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const campaignQuery = new URLSearchParams({
      select: "id,mission_id,name,status,timezone,daily_limit,approved_at,created_at",
      user_id: `eq.${user.id}`,
      order: "created_at.desc",
      limit: "30",
    });
    const campaigns = await readAdminJson<CampaignRow[]>(await adminFetch(`email_campaigns?${campaignQuery}`), "Email campaigns could not be loaded.");
    const scheduledQuery = new URLSearchParams({
      select: "id,campaign_id,contact_id,recipient_email,recipient_name,subject,body,scheduled_at,status,last_error,sent_at",
      user_id: `eq.${user.id}`,
      order: "scheduled_at.asc",
      limit: "1000",
    });
    const emails = await readAdminJson<ScheduledEmailRow[]>(await adminFetch(`scheduled_emails?${scheduledQuery}`), "Scheduled emails could not be loaded.");
    return Response.json({ connection: await connectionFor(user.id), campaigns, emails }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Email campaign load failed", error);
    const message = error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY")
      ? "Email scheduling needs its final server-side Supabase key."
      : "Email campaigns could not be loaded.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30);

    if (action === "disconnect") {
      await adminFetch(`email_campaigns?user_id=eq.${user.id}&status=eq.approved`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paused", updated_at: new Date().toISOString() }),
      });
      const connectionQuery = new URLSearchParams({ select: "encrypted_refresh_token", user_id: `eq.${user.id}`, limit: "1" });
      const storedConnections = await readAdminJson<Array<{ encrypted_refresh_token: string }>>(await adminFetch(`gmail_connections?${connectionQuery}`), "Gmail connection could not be loaded for revocation.");
      if (storedConnections[0]?.encrypted_refresh_token) {
        const refreshToken = await decryptRefreshToken(storedConnections[0].encrypted_refresh_token);
        await revokeGoogleToken(refreshToken);
      }
      const response = await adminFetch(`gmail_connections?user_id=eq.${user.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Gmail could not be disconnected.");
      return Response.json({ disconnected: true });
    }

    if (action === "create_draft") {
      const connection = await connectionFor(user.id);
      if (!connection.connected) return Response.json({ error: "Connect Gmail before creating an email plan." }, { status: 409 });
      const missionId = cleanText(body.missionId, 100);
      const name = cleanText(body.name, 160);
      const timezone = cleanText(body.timezone, 80) || "Europe/Madrid";
      const dailyLimit = typeof body.dailyLimit === "number" ? Math.min(50, Math.max(1, Math.round(body.dailyLimit))) : 10;
      const items = Array.isArray(body.emails) ? body.emails : [];
      if (!missionId || !name || items.length === 0 || items.length > 200) {
        return Response.json({ error: "The proposed email plan is invalid." }, { status: 400 });
      }
      const now = Date.now();
      const maxDate = now + 90 * 24 * 60 * 60 * 1000;
      const normalized = items.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = item as Record<string, unknown>;
        const scheduledAt = new Date(cleanText(value.scheduledAt, 40));
        const row = {
          contact_id: cleanText(value.contactId, 100),
          recipient_email: cleanEmail(value.recipientEmail),
          recipient_name: cleanText(value.recipientName, 160),
          subject: cleanText(value.subject, 200),
          body: cleanText(value.body, 6000),
          scheduled_at: scheduledAt.toISOString(),
        };
        return row.contact_id && row.recipient_email && row.recipient_name && row.subject && row.body && scheduledAt.getTime() > now && scheduledAt.getTime() <= maxDate ? [row] : [];
      });
      if (normalized.length !== items.length) return Response.json({ error: "Every email needs a valid recipient, message, and future send time." }, { status: 400 });

      const campaign = await readAdminJson<CampaignRow[]>(await adminFetch("email_campaigns", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ user_id: user.id, mission_id: missionId, name, timezone, daily_limit: dailyLimit, status: "draft" }),
      }), "The draft email campaign could not be created.");
      const campaignId = campaign[0]?.id;
      if (!campaignId) throw new Error("The draft email campaign could not be created.");
      const emailResponse = await adminFetch("scheduled_emails", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(normalized.map((email) => ({ ...email, campaign_id: campaignId, user_id: user.id, mission_id: missionId, status: "draft" }))),
      });
      if (!emailResponse.ok) {
        await adminFetch(`email_campaigns?id=eq.${campaignId}&user_id=eq.${user.id}`, { method: "DELETE" });
        throw new Error("The proposed emails could not be stored.");
      }
      const emails = await emailResponse.json() as ScheduledEmailRow[];
      return Response.json({ campaign: campaign[0], emails });
    }

    const campaignId = validUuid(body.campaignId);
    if (!campaignId) return Response.json({ error: "A valid campaign is required." }, { status: 400 });
    const ownedQuery = new URLSearchParams({ select: "id,status", id: `eq.${campaignId}`, user_id: `eq.${user.id}`, limit: "1" });
    const owned = await readAdminJson<Array<{ id: string; status: string }>>(await adminFetch(`email_campaigns?${ownedQuery}`), "The email campaign could not be checked.");
    if (!owned[0]) return Response.json({ error: "Email campaign not found." }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "approve") {
      if (owned[0].status !== "draft") return Response.json({ error: "Only a draft plan can be authorized." }, { status: 409 });
      const emailsResponse = await adminFetch(`scheduled_emails?campaign_id=eq.${campaignId}&user_id=eq.${user.id}&status=eq.draft`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: "queued", updated_at: now }),
      });
      if (!emailsResponse.ok) throw new Error("The emails could not be queued.");
      const campaignResponse = await adminFetch(`email_campaigns?id=eq.${campaignId}&user_id=eq.${user.id}&status=eq.draft`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: "approved", approved_at: now, updated_at: now }),
      });
      if (!campaignResponse.ok) throw new Error("The email plan could not be authorized.");
      return Response.json({ status: "approved" });
    }

    if (action === "pause" || action === "resume" || action === "cancel") {
      const nextStatus = action === "pause" ? "paused" : action === "resume" ? "approved" : "cancelled";
      const currentStatus = owned[0].status;
      const allowed = action === "pause" ? currentStatus === "approved" : action === "resume" ? currentStatus === "paused" : !["completed", "cancelled"].includes(currentStatus);
      if (!allowed) return Response.json({ error: "This campaign cannot make that transition." }, { status: 409 });
      const campaignResponse = await adminFetch(`email_campaigns?id=eq.${campaignId}&user_id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, updated_at: now }),
      });
      if (!campaignResponse.ok) throw new Error("The email campaign could not be updated.");
      if (action === "cancel") {
        await adminFetch(`scheduled_emails?campaign_id=eq.${campaignId}&user_id=eq.${user.id}&status=in.(draft,queued)`, {
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled", updated_at: now }),
        });
      }
      return Response.json({ status: nextStatus });
    }

    return Response.json({ error: "Unknown email campaign action." }, { status: 400 });
  } catch (error) {
    console.error("Email campaign action failed", error);
    const message = error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY")
      ? "Email scheduling needs its final server-side Supabase key."
      : error instanceof Error ? error.message : "The email campaign could not be updated.";
    return Response.json({ error: message }, { status: 503 });
  }
}
