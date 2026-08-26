import { createClient } from "@supabase/supabase-js";

// These values are public browser configuration. Environment variables still
// take precedence, while the fallback keeps preview and production builds from
// failing before Vercel environment variables have been configured.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://aavkaczgsjdnkufhdpie.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_AakwsZs8XsRS8MwZfL7pww_Ngwyrb6-";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
