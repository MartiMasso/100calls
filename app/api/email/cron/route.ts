import { adminFetch, readAdminJson } from "@/lib/server/supabase-admin";
import { decryptRefreshToken, refreshGoogleAccessToken, sendGmailMessage } from "@/lib/server/gmail";

type DueEmail = {
  id: string;
  campaign_id: string;
  user_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  attempts: number;
};

function authorized(request: Request): boolean {
  const secret = process.env.EMAIL_SCHEDULER_SECRET?.trim() ?? "";
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function runQueue(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await adminFetch(`scheduled_emails?status=eq.sending&updated_at=lt.${encodeURIComponent(new Date(Date.now() - 20 * 60 * 1000).toISOString())}&attempts=lt.3`, {
    method: "PATCH",
    body: JSON.stringify({ status: "queued", last_error: "Recovered after an interrupted delivery attempt", updated_at: new Date().toISOString() }),
  });
  const dueQuery = new URLSearchParams({
    select: "id,campaign_id,user_id,recipient_email,subject,body,attempts",
    status: "eq.queued",
    scheduled_at: `lte.${new Date().toISOString()}`,
    order: "scheduled_at.asc",
    limit: "10",
  });
  const due = await readAdminJson<DueEmail[]>(await adminFetch(`scheduled_emails?${dueQuery}`), "The email queue could not be read.");
  let sent = 0;
  let failed = 0;
  const senderCache = new Map<string, { accessToken: string; email: string }>();

  for (const email of due) {
    const campaignQuery = new URLSearchParams({ select: "status", id: `eq.${email.campaign_id}`, user_id: `eq.${email.user_id}`, limit: "1" });
    const campaign = await readAdminJson<Array<{ status: string }>>(await adminFetch(`email_campaigns?${campaignQuery}`), "The email campaign could not be checked.");
    if (campaign[0]?.status !== "approved") continue;

    const claim = await adminFetch(`scheduled_emails?id=eq.${email.id}&status=eq.queued`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ status: "sending", attempts: email.attempts + 1, updated_at: new Date().toISOString() }),
    });
    const claimed = claim.ok ? await claim.json() as DueEmail[] : [];
    if (!claimed[0]) continue;

    try {
      let sender = senderCache.get(email.user_id);
      if (!sender) {
        const connectionQuery = new URLSearchParams({ select: "email,encrypted_refresh_token,status", user_id: `eq.${email.user_id}`, limit: "1" });
        const connections = await readAdminJson<Array<{ email: string; encrypted_refresh_token: string; status: string }>>(await adminFetch(`gmail_connections?${connectionQuery}`), "The Gmail connection could not be loaded.");
        const connection = connections[0];
        if (!connection || connection.status !== "connected") throw new Error("Gmail is no longer connected.");
        const refreshToken = await decryptRefreshToken(connection.encrypted_refresh_token);
        sender = { accessToken: await refreshGoogleAccessToken(refreshToken), email: connection.email };
        senderCache.set(email.user_id, sender);
      }
      const messageId = await sendGmailMessage(sender.accessToken, sender.email, email.recipient_email, email.subject, email.body);
      await adminFetch(`scheduled_emails?id=eq.${email.id}&status=eq.sending`, {
        method: "PATCH",
        body: JSON.stringify({ status: "sent", provider_message_id: messageId, sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }),
      });
      sent += 1;
    } catch (error) {
      const attempts = email.attempts + 1;
      const retry = attempts < 3;
      const nextAttempt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await adminFetch(`scheduled_emails?id=eq.${email.id}&status=eq.sending`, {
        method: "PATCH",
        body: JSON.stringify({
          status: retry ? "queued" : "failed",
          scheduled_at: retry ? nextAttempt : undefined,
          last_error: (error instanceof Error ? error.message : "Email delivery failed").slice(0, 500),
          updated_at: new Date().toISOString(),
        }),
      });
      failed += 1;
    }
  }

  return Response.json({ checked: due.length, sent, failed }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    return await runQueue(request);
  } catch (error) {
    console.error("Email queue run failed", error);
    return Response.json({ error: "The email queue could not run." }, { status: 500 });
  }
}

export const GET = POST;
