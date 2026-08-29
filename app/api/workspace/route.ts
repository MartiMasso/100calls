const DEFAULT_SUPABASE_URL = "https://aavkaczgsjdnkufhdpie.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_AakwsZs8XsRS8MwZfL7pww_Ngwyrb6-";
const MAX_MISSIONS_PER_SAVE = 100;
const MAX_STATE_BYTES = 1_500_000;

type AuthenticatedRequest = {
  authorization: string;
  supabaseKey: string;
  supabaseUrl: string;
  userId: string;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function cleanMissionId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

function isWorkspaceState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (state.version !== 1) return false;
  try {
    return JSON.stringify(state).length <= MAX_STATE_BYTES;
  } catch {
    return false;
  }
}

async function authenticate(request: Request): Promise<AuthenticatedRequest | null> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;

  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL") || DEFAULT_SUPABASE_URL;
  const supabaseKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY") || DEFAULT_SUPABASE_KEY;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, authorization },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  if (typeof user.id !== "string" || !user.id) return null;
  return { authorization, supabaseKey, supabaseUrl, userId: user.id };
}

function databaseHeaders(auth: AuthenticatedRequest): HeadersInit {
  return {
    apikey: auth.supabaseKey,
    authorization: auth.authorization,
    "content-type": "application/json",
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticate(request);
    if (!auth) return Response.json({ error: "Please sign in again to load your saved missions." }, { status: 401 });

    const query = new URLSearchParams({
      select: "mission_id,state,updated_at",
      user_id: `eq.${auth.userId}`,
      order: "updated_at.desc",
    });
    const response = await fetch(`${auth.supabaseUrl}/rest/v1/mission_workspaces?${query}`, {
      headers: databaseHeaders(auth),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Mission workspace load failed", { status: response.status, body: await response.text() });
      return Response.json({ error: "Saved mission data could not be loaded." }, { status: 502 });
    }

    const rows = await response.json() as unknown;
    return Response.json({ rows: Array.isArray(rows) ? rows : [] }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Mission workspace load failed", error);
    return Response.json({ error: "Saved mission data could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticate(request);
    if (!auth) return Response.json({ error: "Please sign in again before saving your mission." }, { status: 401 });

    const body = await request.json() as { rows?: unknown };
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > MAX_MISSIONS_PER_SAVE) {
      return Response.json({ error: "The mission save request is invalid." }, { status: 400 });
    }

    const seenMissionIds = new Set<string>();
    const rows = body.rows.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const candidate = value as Record<string, unknown>;
      const missionId = cleanMissionId(candidate.missionId);
      if (!missionId || seenMissionIds.has(missionId) || !isWorkspaceState(candidate.state)) return [];
      seenMissionIds.add(missionId);
      return [{
        user_id: auth.userId,
        mission_id: missionId,
        state: candidate.state,
        updated_at: new Date().toISOString(),
      }];
    });
    if (rows.length !== body.rows.length) {
      return Response.json({ error: "The mission save request contains invalid data." }, { status: 400 });
    }

    const query = new URLSearchParams({ on_conflict: "user_id,mission_id" });
    const response = await fetch(`${auth.supabaseUrl}/rest/v1/mission_workspaces?${query}`, {
      method: "POST",
      headers: {
        ...databaseHeaders(auth),
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Mission workspace save failed", { status: response.status, body: await response.text() });
      return Response.json({ error: "Your latest mission changes could not be saved." }, { status: 502 });
    }

    return Response.json({ saved: rows.length }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Mission workspace save failed", error);
    return Response.json({ error: "Your latest mission changes could not be saved." }, { status: 500 });
  }
}
