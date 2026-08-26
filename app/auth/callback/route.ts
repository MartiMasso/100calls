import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAnonKey, supabaseAuthCookie, supabaseUrl } from "@/lib/supabase-config";

function safeDestination(request: NextRequest): URL {
  const next = request.nextUrl.searchParams.get("next");
  const safePath = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto") ?? "https";

  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return new URL(safePath, `${forwardedProtocol}://${forwardedHost}`);
  }
  return new URL(safePath, request.nextUrl.origin);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?auth_error=google", request.nextUrl.origin));

  const response = NextResponse.redirect(safeDestination(request));
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      name: supabaseAuthCookie,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 400 * 24 * 60 * 60,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/?auth_error=google", request.nextUrl.origin));
  return response;
}
