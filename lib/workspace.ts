import { supabase } from "@/lib/supabase";

/**
 * Workspace data layer. Every mission, plan, note, contact, and message lives
 * in Supabase Postgres behind row level security, so a signed-in user only
 * ever reads and writes their own rows.
 */

export type Mission = {
  id: string;
  title: string;
  audience: string;
  question: string;
  createdAt: string;
};

export type SegmentChange = "unchanged" | "added" | "expanded" | "deprioritized" | "dropped";

export type PlanSegment = {
  title: string;
  subsegments: string[];
  targetCount: number;
  change: SegmentChange;
  changeNote: string;
};

export type ActionPlan = {
  id: string;
  version: number;
  segments: PlanSegment[];
  revisionSummary: string;
  model: string;
  createdAt: string;
};

export type PlanVersionSummary = {
  id: string;
  version: number;
  revisionSummary: string;
  createdAt: string;
};

export type PlanNoteKind = "evidence" | "counter" | "question" | "decision";

export type PlanNote = {
  id: string;
  missionId: string;
  planId: string | null;
  contactId: string | null;
  segment: string;
  kind: PlanNoteKind;
  body: string;
  appliedToPlanId: string | null;
  createdAt: string;
};

export type ContactStatus = "new" | "queued" | "contacted" | "replied" | "scheduled" | "done" | "passed";

export type ContactType = "Potential customer" | "Founder" | "Expert";

export type Contact = {
  id: string;
  missionId: string;
  name: string;
  initials: string;
  role: string;
  company: string;
  sector: string;
  reason: string;
  angle: string;
  fit: number;
  type: ContactType;
  searchPath: string;
  message: string;
  sourceUrl: string;
  linkedinUrl: string;
  contactMethod: string;
  contactUrl: string;
  status: ContactStatus;
  wave: number;
  aiGenerated: boolean;
  color: string;
  createdAt: string;
};

export type ResearchedProfile = Omit<
  Contact,
  "id" | "missionId" | "status" | "wave" | "aiGenerated" | "color" | "createdAt"
>;

export type MessageDirection = "outbound" | "inbound";
export type MessageChannel = "email" | "linkedin" | "form" | "call" | "other";

export type Message = {
  id: string;
  missionId: string;
  contactId: string;
  direction: MessageDirection;
  channel: MessageChannel;
  subject: string;
  body: string;
  occurredAt: string;
};

const CONTACT_COLORS = ["coral", "mint", "blue", "yellow", "lilac", "pink"];
const CONTACT_TYPES = new Set<ContactType>(["Potential customer", "Founder", "Expert"]);
const NOTE_KINDS = new Set<PlanNoteKind>(["evidence", "counter", "question", "decision"]);
const LEGACY_WORKSPACE_KEY = "one_hundred_calls_workspace";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Stable per-contact accent so a profile keeps its colour across reloads. */
function colorFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  return CONTACT_COLORS[hash % CONTACT_COLORS.length];
}

function readSegments(value: unknown): PlanSegment[] {
  if (!Array.isArray(value)) return [];
  const changes = new Set(["unchanged", "added", "expanded", "deprioritized", "dropped"]);
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Row;
    const change = text(raw.change, "unchanged");
    const segment: PlanSegment = {
      // `sector` and `roles` are the field names used by plans saved before
      // the plan became a plain segment list.
      title: text(raw.title) || text(raw.sector),
      subsegments: stringList(raw.subsegments).length > 0 ? stringList(raw.subsegments) : stringList(raw.roles),
      targetCount: count(raw.targetCount, 6),
      change: (changes.has(change) ? change : "unchanged") as SegmentChange,
      changeNote: text(raw.changeNote),
    };
    return segment.title ? [segment] : [];
  });
}

function toMission(row: Row): Mission {
  return {
    id: text(row.id),
    title: text(row.title),
    audience: text(row.audience),
    question: text(row.question),
    createdAt: text(row.created_at),
  };
}

function toPlan(row: Row): ActionPlan {
  return {
    id: text(row.id),
    version: count(row.version, 1),
    segments: readSegments(row.segments),
    revisionSummary: text(row.revision_summary),
    model: text(row.model),
    createdAt: text(row.created_at),
  };
}

function toPlanNote(row: Row): PlanNote {
  const kind = text(row.kind, "evidence") as PlanNoteKind;
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    planId: typeof row.plan_id === "string" ? row.plan_id : null,
    contactId: typeof row.contact_id === "string" ? row.contact_id : null,
    segment: text(row.segment),
    kind: NOTE_KINDS.has(kind) ? kind : "evidence",
    body: text(row.body),
    appliedToPlanId: typeof row.applied_to_plan_id === "string" ? row.applied_to_plan_id : null,
    createdAt: text(row.created_at),
  };
}

function toContact(row: Row): Contact {
  const id = text(row.id);
  const type = text(row.type, "Expert") as ContactType;
  return {
    id,
    missionId: text(row.mission_id),
    name: text(row.name),
    initials: text(row.initials),
    role: text(row.role),
    company: text(row.company),
    sector: text(row.sector),
    reason: text(row.reason),
    angle: text(row.angle),
    fit: count(row.fit, 60),
    type: CONTACT_TYPES.has(type) ? type : "Expert",
    searchPath: text(row.search_path),
    message: text(row.message),
    sourceUrl: text(row.source_url),
    linkedinUrl: text(row.linkedin_url),
    contactMethod: text(row.contact_method),
    contactUrl: text(row.contact_url),
    status: text(row.status, "new") as ContactStatus,
    wave: count(row.wave, 1),
    aiGenerated: row.ai_generated !== false,
    color: colorFor(id),
    createdAt: text(row.created_at),
  };
}

function toMessage(row: Row): Message {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    contactId: text(row.contact_id),
    direction: text(row.direction, "outbound") as MessageDirection,
    channel: text(row.channel, "email") as MessageChannel,
    subject: text(row.subject),
    body: text(row.body),
    occurredAt: text(row.occurred_at),
  };
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Supabase returned no data.");
  return result.data;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export async function fetchMissions(): Promise<Mission[]> {
  const rows = unwrap(await supabase.from("missions").select("*").eq("archived", false).order("created_at", { ascending: false }));
  return (rows as Row[]).map(toMission);
}

export async function createMission(fields: Pick<Mission, "title" | "audience" | "question">): Promise<Mission> {
  const rows = unwrap(await supabase.from("missions").insert(fields).select("*"));
  return toMission((rows as Row[])[0]);
}

export async function updateMission(id: string, fields: Pick<Mission, "title" | "audience" | "question">): Promise<Mission> {
  const rows = unwrap(await supabase.from("missions").update(fields).eq("id", id).select("*"));
  return toMission((rows as Row[])[0]);
}

export async function archiveMission(id: string): Promise<void> {
  unwrap(await supabase.from("missions").update({ archived: true }).eq("id", id).select("id"));
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function fetchLatestPlan(missionId: string): Promise<ActionPlan | null> {
  const rows = unwrap(
    await supabase.from("plans").select("*").eq("mission_id", missionId).order("version", { ascending: false }).limit(1),
  );
  const [row] = rows as Row[];
  return row ? toPlan(row) : null;
}

export async function fetchPlanVersions(missionId: string): Promise<PlanVersionSummary[]> {
  const rows = unwrap(
    await supabase
      .from("plans")
      .select("id, version, revision_summary, created_at")
      .eq("mission_id", missionId)
      .order("version", { ascending: false }),
  );
  return (rows as Row[]).map((row) => ({
    id: text(row.id),
    version: count(row.version, 1),
    revisionSummary: text(row.revision_summary),
    createdAt: text(row.created_at),
  }));
}

type PlanDraft = { segments: PlanSegment[]; revisionSummary: string; model: string };

export async function savePlanVersion(missionId: string, draft: PlanDraft): Promise<ActionPlan> {
  const existing = unwrap(
    await supabase.from("plans").select("version").eq("mission_id", missionId).order("version", { ascending: false }).limit(1),
  ) as Row[];
  const version = count(existing[0]?.version, 0) + 1;

  const rows = unwrap(
    await supabase
      .from("plans")
      .insert({
        mission_id: missionId,
        version,
        objective: "",
        hypothesis: "",
        segments: draft.segments,
        revision_summary: draft.revisionSummary,
        model: draft.model,
      })
      .select("*"),
  );
  return toPlan((rows as Row[])[0]);
}

// ---------------------------------------------------------------------------
// Plan notes
// ---------------------------------------------------------------------------

export async function fetchPlanNotes(missionId: string): Promise<PlanNote[]> {
  const rows = unwrap(
    await supabase.from("plan_notes").select("*").eq("mission_id", missionId).order("created_at", { ascending: false }),
  );
  return (rows as Row[]).map(toPlanNote);
}

export async function addPlanNote(input: {
  missionId: string;
  planId: string | null;
  segment: string;
  kind: PlanNoteKind;
  body: string;
  contactId?: string | null;
}): Promise<PlanNote> {
  const rows = unwrap(
    await supabase
      .from("plan_notes")
      .insert({
        mission_id: input.missionId,
        plan_id: input.planId,
        segment: input.segment,
        kind: input.kind,
        body: input.body,
        contact_id: input.contactId ?? null,
      })
      .select("*"),
  );
  return toPlanNote((rows as Row[])[0]);
}

export async function deletePlanNote(id: string): Promise<void> {
  const { error } = await supabase.from("plan_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Marks the notes that were fed into a revision, so the margin can show what is already reflected. */
export async function markNotesApplied(noteIds: string[], planId: string): Promise<void> {
  if (noteIds.length === 0) return;
  const { error } = await supabase.from("plan_notes").update({ applied_to_plan_id: planId }).in("id", noteIds);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function fetchContacts(missionId: string): Promise<Contact[]> {
  const rows = unwrap(
    await supabase.from("contacts").select("*").eq("mission_id", missionId).order("created_at", { ascending: true }),
  );
  return (rows as Row[]).map(toContact);
}

export async function insertContacts(missionId: string, profiles: ResearchedProfile[], wave: number): Promise<Contact[]> {
  if (profiles.length === 0) return [];
  const rows = unwrap(
    await supabase
      .from("contacts")
      .insert(profiles.map((profile) => ({
        mission_id: missionId,
        name: profile.name,
        initials: profile.initials,
        role: profile.role,
        company: profile.company,
        sector: profile.sector,
        reason: profile.reason,
        angle: profile.angle,
        fit: profile.fit,
        type: profile.type,
        search_path: profile.searchPath,
        message: profile.message,
        source_url: profile.sourceUrl,
        linkedin_url: profile.linkedinUrl,
        contact_method: profile.contactMethod,
        contact_url: profile.contactUrl,
        wave,
      })))
      .select("*"),
  );
  return (rows as Row[]).map(toContact);
}

export async function updateContactStatus(id: string, status: ContactStatus): Promise<void> {
  const { error } = await supabase.from("contacts").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function replaceMissionContacts(missionId: string): Promise<void> {
  const { error } = await supabase.from("contacts").delete().eq("mission_id", missionId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function fetchMessages(missionId: string): Promise<Message[]> {
  const rows = unwrap(
    await supabase.from("messages").select("*").eq("mission_id", missionId).order("occurred_at", { ascending: true }),
  );
  return (rows as Row[]).map(toMessage);
}

export async function logMessage(input: {
  missionId: string;
  contactId: string;
  direction: MessageDirection;
  channel: MessageChannel;
  subject: string;
  body: string;
}): Promise<Message> {
  const rows = unwrap(
    await supabase
      .from("messages")
      .insert({
        mission_id: input.missionId,
        contact_id: input.contactId,
        direction: input.direction,
        channel: input.channel,
        subject: input.subject,
        body: input.body,
      })
      .select("*"),
  );
  return toMessage((rows as Row[])[0]);
}

// ---------------------------------------------------------------------------
// One-time migration from the old user_metadata workspace
// ---------------------------------------------------------------------------

/**
 * Moves missions stored in the pre-database build into Postgres. Runs only when
 * the account still carries the legacy key and has no rows yet.
 */
export async function migrateLegacyWorkspace(metadata: Record<string, unknown> | undefined): Promise<Mission[]> {
  const legacy = metadata?.[LEGACY_WORKSPACE_KEY];
  if (!legacy || typeof legacy !== "object") return [];

  const missions = (legacy as Row).missions;
  if (!Array.isArray(missions)) return [];

  const drafts = missions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Row;
    const draft = {
      title: text(raw.title).slice(0, 600),
      audience: text(raw.audience).slice(0, 400),
      question: text(raw.question).slice(0, 400),
    };
    return draft.title && draft.audience && draft.question ? [draft] : [];
  });
  if (drafts.length === 0) return [];

  const rows = unwrap(await supabase.from("missions").insert(drafts.reverse()).select("*"));
  await supabase.auth.updateUser({ data: { [LEGACY_WORKSPACE_KEY]: null } });
  return (rows as Row[]).map(toMission);
}
