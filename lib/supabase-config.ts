export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://aavkaczgsjdnkufhdpie.supabase.co";

export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_AakwsZs8XsRS8MwZfL7pww_Ngwyrb6-";

export const supabaseProjectRef = new URL(supabaseUrl).hostname.split(".")[0];
export const supabaseAuthCookie = `sb-${supabaseProjectRef}-auth-token`;
