import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/server/supabase-admin";
import { encryptRefreshToken, exchangeAuthorizationCode, verifyGoogleIdentity, verifyOAuthState } from "@/lib/server/gmail";

function finish(request: NextRequest, result: "connected" | "denied" | "error") {
  const url = new URL("/", request.url);
  url.searchParams.set("gmail", result);
  const response = NextResponse.redirect(url);
  response.cookies.delete("gmail_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("error")) return finish(request, "denied");
    const code = request.nextUrl.searchParams.get("code") ?? "";
    const state = request.nextUrl.searchParams.get("state") ?? "";
    const nonce = request.cookies.get("gmail_oauth_state")?.value ?? "";
    const verifiedState = await verifyOAuthState(state, nonce);
    if (!code || !verifiedState) return finish(request, "error");

    const tokens = await exchangeAuthorizationCode(code);
    const identity = tokens.id_token ? await verifyGoogleIdentity(tokens.id_token) : null;
    if (!identity || !tokens.refresh_token) {
      console.error("Gmail callback is missing a verified identity or refresh token.");
      return finish(request, "error");
    }
    const encryptedRefreshToken = await encryptRefreshToken(tokens.refresh_token);
    const response = await adminFetch("gmail_connections?on_conflict=user_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: verifiedState.userId,
        email: identity.email,
        encrypted_refresh_token: encryptedRefreshToken,
        scopes: tokens.scope ? tokens.scope.split(" ") : [],
        status: "connected",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      console.error("Gmail connection could not be stored", { status: response.status, detail: await response.text() });
      return finish(request, "error");
    }
    return finish(request, "connected");
  } catch (error) {
    console.error("Gmail callback failed", error);
    return finish(request, "error");
  }
}
