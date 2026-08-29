const DEFAULT_SUPABASE_URL = "https://aavkaczgsjdnkufhdpie.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_AakwsZs8XsRS8MwZfL7pww_Ngwyrb6-";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function supabaseServerConfig() {
  return {
    url: env("NEXT_PUBLIC_SUPABASE_URL") || DEFAULT_SUPABASE_URL,
    publicKey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY") || DEFAULT_SUPABASE_KEY,
    adminKey: env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY"),
  };
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const { url, publicKey } = supabaseServerConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publicKey, authorization },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown; email?: unknown };
  if (typeof user.id !== "string" || !user.id) return null;
  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : "",
  };
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, adminKey } = supabaseServerConfig();
  if (!adminKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", adminKey);
  headers.set("authorization", `Bearer ${adminKey}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
}

export async function readAdminJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(fallbackMessage, { status: response.status, detail });
    throw new Error(fallbackMessage);
  }
  return response.json() as Promise<T>;
}
