import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/supabase-admin";
import { createOAuthState, googleAuthorizationUrl } from "@/lib/server/gmail";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user) return NextResponse.json({ error: "Please sign in again before connecting Gmail." }, { status: 401 });
    const nonce = crypto.randomUUID();
    const state = await createOAuthState(user.id, nonce);
    const response = NextResponse.json({ url: googleAuthorizationUrl(state) });
    response.cookies.set("gmail_oauth_state", nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error("Gmail connection could not start", error);
    return NextResponse.json({ error: "Gmail connection is not fully configured yet." }, { status: 503 });
  }
}
