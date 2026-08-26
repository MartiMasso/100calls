import { createClient } from "@supabase/supabase-js";

// These values are public browser configuration. Environment variables still
// take precedence, while the fallback keeps preview and production builds from
// failing before Vercel environment variables have been configured.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://aavkaczgsjdnkufhdpie.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhYXZrYWN6Z3NqZG5rdWZoZHBpZSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzg3NzM4NDgyLCJleHAiOjIxMDMzMTQ0ODJ9.GnUYASfxYUZiVuHZUPXRSmws5fuEsQoIJhGROGC6v-o";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
