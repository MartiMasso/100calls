import { createBrowserClient } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

// These values are public browser configuration. Environment variables still
// take precedence, while the fallback keeps preview and production builds from
// failing before Vercel environment variables have been configured.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://aavkaczgsjdnkufhdpie.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_AakwsZs8XsRS8MwZfL7pww_Ngwyrb6-";

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const legacyStorageKey = `sb-${projectRef}-auth-token`;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
  cookieOptions: {
    name: legacyStorageKey,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 400 * 24 * 60 * 60,
  },
});

/**
 * Restores the cookie-backed session and migrates sessions created by the
 * previous localStorage client so existing users only need to sign in once.
 */
export async function restorePersistedSession(): Promise<Session | null> {
  const { data: current, error: currentError } = await supabase.auth.getSession();
  if (currentError) throw currentError;
  if (current.session || typeof window === "undefined") return current.session;

  const savedSession = window.localStorage.getItem(legacyStorageKey);
  if (!savedSession) return null;

  try {
    const parsed = JSON.parse(savedSession) as {
      access_token?: unknown;
      refresh_token?: unknown;
    };
    if (typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string") {
      window.localStorage.removeItem(legacyStorageKey);
      return null;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (error) throw error;

    window.localStorage.removeItem(legacyStorageKey);
    return data.session;
  } catch {
    window.localStorage.removeItem(legacyStorageKey);
    return null;
  }
}
