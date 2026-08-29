"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { restorePersistedSession, supabase } from "@/lib/supabase";

type AuthMode = "signin" | "signup" | "forgot" | "reset";
type MissionModalMode = "new" | "edit";
type Mission = {
  id: string;
  title: string;
  audience: string;
  question: string;
  context: string;
};
type LinkedInWorkflow = "connect_first" | "direct_when_available" | "either";
type UserOutreachProfile = {
  version: 1;
  name: string;
  role: string;
  organization: string;
  background: string;
  preferredLanguage: string;
  linkedinConnectionLimit: 0 | 200 | 300;
  linkedinWorkflow: LinkedInWorkflow;
};
type OutreachChannel = "Email" | "LinkedIn connection" | "LinkedIn message" | "Public contact form" | "No direct route";
type OutreachDrafts = {
  emailSubject: string;
  emailBody: string;
  linkedinConnectionMessage: string;
  linkedinDirectMessage: string;
  contactFormMessage: string;
  recommendedChannel: OutreachChannel;
  channelRationale: string;
};
type Contact = {
  id: number;
  initials: string;
  name: string;
  role: string;
  company: string;
  sector: string;
  reason: string;
  angle: string;
  fit: number;
  type: "Potential customer" | "Founder" | "Expert";
  color: string;
  warm: string;
  message?: string;
  sourceUrl?: string;
  linkedinUrl?: string;
  contactMethod?: string;
  contactUrl?: string;
  publicEmail?: string;
  emailSourceUrl?: string;
  outreach?: OutreachDrafts;
  aiGenerated?: boolean;
};

type PlanSegment = {
  sector: string;
  priority: "Primary" | "Secondary" | "Exploratory";
  roles: string[];
  why: string;
  learningGoal: string;
  targetCount: number;
  searchApproach: string;
};

type ActionPlan = {
  objective: string;
  hypothesis: string;
  recommendedInterviews: number;
  segments: PlanSegment[];
  sequence: Array<{ title: string; detail: string; outcome: string }>;
  questions: string[];
  successCriteria: string[];
  model: string;
};

type PlanResponse = {
  stage: "plan" | "refine";
  plan: Omit<ActionPlan, "model">;
  model: string;
};

type ContactResearchResponse = {
  stage: "contacts";
  model: string;
  profiles: Array<{
    name: string;
    initials: string;
    role: string;
    company: string;
    sector: string;
    reason: string;
    angle: string;
    fit: number;
    type: Contact["type"];
    searchPath: string;
    message: string;
    sourceUrl: string;
    linkedinUrl: string;
    contactMethod: string;
    contactUrl: string;
    publicEmail: string;
  }>;
};

type OutreachResponse = {
  stage: "outreach";
  model: string;
  outreach: OutreachDrafts;
};

type EmailBatchResponse = {
  stage: "email_batch";
  model: string;
  drafts: Array<{ contactId: string; subject: string; body: string }>;
};

type EmailEnrichmentResponse = {
  stage: "email_enrichment";
  model: string;
  checked: number;
  results: Array<{ contactId: string; publicEmail: string; sourceUrl: string }>;
};

type GmailConnection = { connected: boolean; email: string; connectedAt: string };
type EmailCampaign = {
  id: string;
  mission_id: string;
  name: string;
  status: "draft" | "approved" | "paused" | "completed" | "cancelled";
  timezone: string;
  daily_limit: number;
  approved_at: string | null;
  created_at: string;
};
type ScheduledEmail = {
  id: string;
  campaign_id: string;
  contact_id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  scheduled_at: string;
  status: "draft" | "queued" | "sending" | "sent" | "failed" | "cancelled";
  last_error: string | null;
  sent_at: string | null;
};

type MissionResearch = {
  contacts: Contact[];
  plan: ActionPlan | null;
  error: string;
  discovered: boolean;
  isPlanning: boolean;
  isDiscovering: boolean;
  isRefining: boolean;
  contacted: number[];
  strategyNotes: StrategyNote[];
};

type StrategyNote = {
  id: string;
  sector: string;
  text: string;
  createdAt: string;
};

type StoredMissionWorkspace = {
  version: 1;
  activeMissionId: string;
  missions: Mission[];
};

type PersistedMissionResearch = {
  version: 1;
  contacts: Contact[];
  plan: ActionPlan | null;
  discovered: boolean;
  contacted: number[];
  strategyNotes: StrategyNote[];
};

type WorkspaceSyncStatus = "loading" | "saving" | "saved" | "error";

type WorkspaceLoadResponse = {
  rows?: Array<{ mission_id?: unknown; state?: unknown; updated_at?: unknown }>;
  error?: string;
};

const MISSION_METADATA_KEY = "one_hundred_calls_workspace";
const OUTREACH_PROFILE_METADATA_KEY = "one_hundred_calls_outreach_profile";
const defaultOutreachProfile: UserOutreachProfile = {
  version: 1,
  name: "",
  role: "",
  organization: "",
  background: "",
  preferredLanguage: "English",
  linkedinConnectionLimit: 200,
  linkedinWorkflow: "connect_first",
};
const starterMission: Mission = {
  id: "late-payments-smbs",
  title: "Validate a tool that reduces late payments for SMBs",
  audience: "finance leaders, B2B founders, and collections experts",
  question: "the problem, urgency, and willingness to pay",
  context: "",
};

const emptyResearch = (): MissionResearch => ({
  contacts: [],
  plan: null,
  error: "",
  discovered: false,
  isPlanning: false,
  isDiscovering: false,
  isRefining: false,
  contacted: [],
  strategyNotes: [],
});

function cleanMissionField(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStoredUrl(value: unknown): string {
  const url = cleanMissionField(value, 500);
  if (!url) return "";
  try {
    return new URL(url).protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

function cleanStoredEmail(value: unknown): string {
  const email = cleanMissionField(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function readStoredOutreach(value: unknown): OutreachDrafts | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const requestedChannel = cleanMissionField(candidate.recommendedChannel, 40);
  const allowedChannels = new Set<OutreachChannel>(["Email", "LinkedIn connection", "LinkedIn message", "Public contact form", "No direct route"]);
  const outreach: OutreachDrafts = {
    emailSubject: cleanMissionField(candidate.emailSubject, 200),
    emailBody: cleanMissionField(candidate.emailBody, 2400),
    linkedinConnectionMessage: cleanMissionField(candidate.linkedinConnectionMessage, 300),
    linkedinDirectMessage: cleanMissionField(candidate.linkedinDirectMessage, 1800),
    contactFormMessage: cleanMissionField(candidate.contactFormMessage, 1800),
    recommendedChannel: allowedChannels.has(requestedChannel as OutreachChannel) ? requestedChannel as OutreachChannel : "No direct route",
    channelRationale: cleanMissionField(candidate.channelRationale, 400),
  };
  return outreach.channelRationale && Object.values(outreach).some((item) => typeof item === "string" && item.length > 0)
    ? outreach
    : undefined;
}

function readStoredOutreachProfile(metadata: Record<string, unknown> | undefined): UserOutreachProfile {
  const stored = metadata?.[OUTREACH_PROFILE_METADATA_KEY];
  if (!stored || typeof stored !== "object") return defaultOutreachProfile;
  const candidate = stored as Record<string, unknown>;
  const requestedLimit = candidate.linkedinConnectionLimit;
  const requestedWorkflow = candidate.linkedinWorkflow;
  return {
    version: 1,
    name: cleanMissionField(candidate.name, 120),
    role: cleanMissionField(candidate.role, 160),
    organization: cleanMissionField(candidate.organization, 160),
    background: cleanMissionField(candidate.background, 1600),
    preferredLanguage: cleanMissionField(candidate.preferredLanguage, 80) || "English",
    linkedinConnectionLimit: requestedLimit === 0 || requestedLimit === 300 ? requestedLimit : 200,
    linkedinWorkflow: requestedWorkflow === "direct_when_available" || requestedWorkflow === "either" ? requestedWorkflow : "connect_first",
  };
}

function cleanStoredNumber(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : null;
}

function cleanStoredStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanMissionField(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function readStoredPlanSegment(value: unknown): PlanSegment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const priority = candidate.priority;
  const targetCount = cleanStoredNumber(candidate.targetCount, 1, 100);
  const segment: PlanSegment = {
    sector: cleanMissionField(candidate.sector, 120),
    priority: priority === "Primary" || priority === "Secondary" || priority === "Exploratory" ? priority : "Exploratory",
    roles: cleanStoredStringArray(candidate.roles, 8, 120),
    why: cleanMissionField(candidate.why, 500),
    learningGoal: cleanMissionField(candidate.learningGoal, 500),
    targetCount: targetCount ?? 1,
    searchApproach: cleanMissionField(candidate.searchApproach, 500),
  };
  return segment.sector && segment.roles.length && segment.why && segment.learningGoal && segment.searchApproach
    ? segment
    : null;
}

function readStoredActionPlan(value: unknown): ActionPlan | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const segments = Array.isArray(candidate.segments)
    ? candidate.segments.flatMap((segment) => {
      const parsed = readStoredPlanSegment(segment);
      return parsed ? [parsed] : [];
    }).slice(0, 8)
    : [];
  const sequence = Array.isArray(candidate.sequence)
    ? candidate.sequence.flatMap((step) => {
      if (!step || typeof step !== "object") return [];
      const item = step as Record<string, unknown>;
      const parsed = {
        title: cleanMissionField(item.title, 120),
        detail: cleanMissionField(item.detail, 500),
        outcome: cleanMissionField(item.outcome, 320),
      };
      return parsed.title && parsed.detail && parsed.outcome ? [parsed] : [];
    }).slice(0, 8)
    : [];
  const recommendedInterviews = cleanStoredNumber(candidate.recommendedInterviews, 1, 100);
  const plan: ActionPlan = {
    objective: cleanMissionField(candidate.objective, 700),
    hypothesis: cleanMissionField(candidate.hypothesis, 700),
    recommendedInterviews: recommendedInterviews ?? 1,
    segments,
    sequence,
    questions: cleanStoredStringArray(candidate.questions, 12, 320),
    successCriteria: cleanStoredStringArray(candidate.successCriteria, 10, 320),
    model: cleanMissionField(candidate.model, 120),
  };
  return plan.objective && plan.hypothesis && plan.segments.length && plan.sequence.length && plan.model
    ? plan
    : null;
}

function readStoredContact(value: unknown): Contact | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = cleanStoredNumber(candidate.id, 1, Number.MAX_SAFE_INTEGER);
  const fit = cleanStoredNumber(candidate.fit, 0, 100);
  const type = candidate.type;
  const color = cleanMissionField(candidate.color, 20);
  const contact: Contact = {
    id: id ?? 0,
    initials: cleanMissionField(candidate.initials, 6),
    name: cleanMissionField(candidate.name, 140),
    role: cleanMissionField(candidate.role, 180),
    company: cleanMissionField(candidate.company, 180),
    sector: cleanMissionField(candidate.sector, 140),
    reason: cleanMissionField(candidate.reason, 500),
    angle: cleanMissionField(candidate.angle, 500),
    fit: fit ?? 0,
    type: type === "Potential customer" || type === "Founder" || type === "Expert" ? type : "Expert",
    color: ["coral", "mint", "blue", "yellow", "lilac", "pink"].includes(color) ? color : "blue",
    warm: cleanMissionField(candidate.warm, 320),
    message: cleanMissionField(candidate.message, 1200) || undefined,
    sourceUrl: cleanStoredUrl(candidate.sourceUrl) || undefined,
    linkedinUrl: cleanStoredUrl(candidate.linkedinUrl) || undefined,
    contactMethod: cleanMissionField(candidate.contactMethod, 240) || undefined,
    contactUrl: cleanStoredUrl(candidate.contactUrl) || undefined,
    publicEmail: cleanStoredEmail(candidate.publicEmail) || undefined,
    emailSourceUrl: cleanStoredUrl(candidate.emailSourceUrl) || undefined,
    outreach: readStoredOutreach(candidate.outreach),
    aiGenerated: candidate.aiGenerated === true,
  };
  return contact.id && contact.initials && contact.name && contact.role && contact.company && contact.sector
    && contact.reason && contact.angle && contact.warm
    ? contact
    : null;
}

function readPersistedMissionResearch(value: unknown): MissionResearch {
  if (!value || typeof value !== "object") return emptyResearch();
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return emptyResearch();

  const contacts = Array.isArray(candidate.contacts)
    ? candidate.contacts.flatMap((contact) => {
      const parsed = readStoredContact(contact);
      return parsed ? [parsed] : [];
    }).filter((contact, index, items) => items.findIndex((item) => item.id === contact.id) === index).slice(0, 200)
    : [];
  const validContactIds = new Set(contacts.map((contact) => contact.id));
  const contacted = Array.isArray(candidate.contacted)
    ? candidate.contacted.flatMap((id) => {
      const parsed = cleanStoredNumber(id, 1, Number.MAX_SAFE_INTEGER);
      return parsed && validContactIds.has(parsed) ? [parsed] : [];
    }).filter((id, index, items) => items.indexOf(id) === index)
    : [];
  const strategyNotes = Array.isArray(candidate.strategyNotes)
    ? candidate.strategyNotes.flatMap((note) => {
      if (!note || typeof note !== "object") return [];
      const item = note as Record<string, unknown>;
      const parsed: StrategyNote = {
        id: cleanMissionField(item.id, 100),
        sector: cleanMissionField(item.sector, 140),
        text: cleanMissionField(item.text, 700),
        createdAt: cleanMissionField(item.createdAt, 40),
      };
      return parsed.id && parsed.sector && parsed.text && parsed.createdAt ? [parsed] : [];
    }).slice(0, 500)
    : [];

  return {
    contacts,
    plan: readStoredActionPlan(candidate.plan),
    error: "",
    discovered: candidate.discovered === true || contacts.length > 0,
    isPlanning: false,
    isDiscovering: false,
    isRefining: false,
    contacted,
    strategyNotes,
  };
}

function toPersistedMissionResearch(research: MissionResearch): PersistedMissionResearch {
  return {
    version: 1,
    contacts: research.contacts,
    plan: research.plan,
    discovered: research.discovered,
    contacted: research.contacted,
    strategyNotes: research.strategyNotes,
  };
}

function researchHash(research: MissionResearch): string {
  return JSON.stringify(toPersistedMissionResearch(research));
}

function readStoredMission(value: unknown): Mission | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const mission = {
    id: cleanMissionField(candidate.id, 100),
    title: cleanMissionField(candidate.title, 600),
    audience: cleanMissionField(candidate.audience, 400),
    question: cleanMissionField(candidate.question, 400),
    context: cleanMissionField(candidate.context, 2500),
  };
  return mission.id && mission.title && mission.audience && mission.question ? mission : null;
}

function readStoredMissionWorkspace(metadata: Record<string, unknown> | undefined): StoredMissionWorkspace | null {
  const stored = metadata?.[MISSION_METADATA_KEY];
  if (!stored || typeof stored !== "object") return null;
  const candidate = stored as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.missions)) return null;

  const missions = candidate.missions.flatMap((mission) => {
    const parsed = readStoredMission(mission);
    return parsed ? [parsed] : [];
  });
  const uniqueMissions = missions.filter((mission, index) => missions.findIndex((item) => item.id === mission.id) === index);
  if (uniqueMissions.length === 0) return null;

  const requestedActiveId = cleanMissionField(candidate.activeMissionId, 100);
  const activeMissionId = uniqueMissions.some((mission) => mission.id === requestedActiveId)
    ? requestedActiveId
    : uniqueMissions[0].id;

  return { version: 1, activeMissionId, missions: uniqueMissions };
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "reset"
  );
  const [showAccount, setShowAccount] = useState(false);
  const [showOutreachSettings, setShowOutreachSettings] = useState(false);
  const [showEmailCampaign, setShowEmailCampaign] = useState(false);
  const [isEnrichingEmails, setIsEnrichingEmails] = useState(false);
  const [userOutreachProfile, setUserOutreachProfile] = useState<UserOutreachProfile>(defaultOutreachProfile);
  const [generatingOutreachId, setGeneratingOutreachId] = useState<number | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const outreachRequestsRef = useRef<Set<number>>(new Set());
  const missionSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const researchSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const researchHydratedUserRef = useRef<string | null>(null);
  const persistedResearchHashesRef = useRef<Record<string, string>>({});
  const [selected, setSelected] = useState<Contact | null>(null);
  const [missions, setMissions] = useState<Mission[]>([starterMission]);
  const [activeMissionId, setActiveMissionId] = useState(starterMission.id);
  const [missionResearch, setMissionResearch] = useState<Record<string, MissionResearch>>({
    [starterMission.id]: emptyResearch(),
  });
  const [missionListOpen, setMissionListOpen] = useState(true);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [missionModalMode, setMissionModalMode] = useState<MissionModalMode | null>(null);
  const [noteSector, setNoteSector] = useState<string | null>(null);
  const [expansionOpen, setExpansionOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(true);
  const [candidateListOpen, setCandidateListOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [workspaceSyncStatus, setWorkspaceSyncStatus] = useState<WorkspaceSyncStatus>("loading");
  const [workspaceStorageError, setWorkspaceStorageError] = useState("");
  const sessionUserId = session?.user.id;
  const sessionAccessToken = session?.access_token;

  const queueResearchPersistence = useCallback((snapshot: Record<string, MissionResearch>, force = false) => {
    const userId = sessionUserId;
    const accessToken = sessionAccessToken;
    if (!userId || !accessToken || researchHydratedUserRef.current !== userId) return Promise.resolve();

    const changedRows = Object.entries(snapshot).flatMap(([missionId, research]) => {
      const state = toPersistedMissionResearch(research);
      const hash = JSON.stringify(state);
      if (!force && persistedResearchHashesRef.current[missionId] === hash) return [];
      return [{
        user_id: userId,
        mission_id: missionId,
        state,
        updated_at: new Date().toISOString(),
        hash,
      }];
    });
    if (changedRows.length === 0) return researchSaveQueueRef.current;

    setWorkspaceSyncStatus("saving");
    setWorkspaceStorageError("");
    const operation = researchSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            rows: changedRows.map(({ mission_id: missionId, state }) => ({ missionId, state })),
          }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error || "Your latest mission changes could not be saved.");
        }
        changedRows.forEach(({ mission_id: missionId, hash }) => {
          persistedResearchHashesRef.current[missionId] = hash;
        });
      });

    researchSaveQueueRef.current = operation;
    void operation.then(
      () => {
        if (researchHydratedUserRef.current === userId) setWorkspaceSyncStatus("saved");
      },
      () => {
        if (researchHydratedUserRef.current !== userId) return;
        setWorkspaceSyncStatus("error");
        setWorkspaceStorageError("Your latest mission changes could not be saved. Please try again before signing out.");
      },
    );
    return operation;
  }, [sessionAccessToken, sessionUserId]);

  useEffect(() => {
    let active = true;
    let hydrationVersion = 0;

    const applySession = async (nextSession: Session | null) => {
      const currentHydration = ++hydrationVersion;
      if (!active) return;
      researchHydratedUserRef.current = null;
      persistedResearchHashesRef.current = {};
      setSession(nextSession);
      setWorkspaceStorageError("");
      if (!nextSession) {
        setUserOutreachProfile(defaultOutreachProfile);
        setWorkspaceSyncStatus("loading");
        setAuthLoading(false);
        return;
      }

      const storedWorkspace = readStoredMissionWorkspace(nextSession.user.user_metadata as Record<string, unknown> | undefined);
      setUserOutreachProfile(readStoredOutreachProfile(nextSession.user.user_metadata as Record<string, unknown> | undefined));
      const nextMissions = storedWorkspace?.missions ?? [starterMission];
      const nextActiveMissionId = storedWorkspace?.activeMissionId ?? starterMission.id;

      const response = await fetch("/api/workspace", {
        headers: { authorization: `Bearer ${nextSession.access_token}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as WorkspaceLoadResponse;
      if (!active || currentHydration !== hydrationVersion) return;

      if (!response.ok) {
        setMissions(nextMissions);
        setActiveMissionId(nextActiveMissionId);
        setMissionResearch((current) => {
          const preservedResearch: Record<string, MissionResearch> = {};
          nextMissions.forEach((mission) => {
            preservedResearch[mission.id] = current[mission.id] ?? emptyResearch();
          });
          return preservedResearch;
        });
        setWorkspaceSyncStatus("error");
        setWorkspaceStorageError(result.error || "Saved mission data could not be loaded. Your current screen has been preserved.");
        setAuthLoading(false);
        return;
      }

      const storedResearch = new Map(
        (result.rows ?? []).flatMap((row) => {
          const missionId = cleanMissionField(row.mission_id, 100);
          return missionId ? [[missionId, readPersistedMissionResearch(row.state)] as const] : [];
        }),
      );
      const nextResearch: Record<string, MissionResearch> = {};
      nextMissions.forEach((mission) => {
        const research = storedResearch.get(mission.id) ?? emptyResearch();
        nextResearch[mission.id] = research;
        persistedResearchHashesRef.current[mission.id] = researchHash(research);
      });

      setMissions(nextMissions);
      setActiveMissionId(nextActiveMissionId);
      setMissionResearch(nextResearch);
      setSelected(null);
      setFilter("All");
      setQuery("");
      researchHydratedUserRef.current = nextSession.user.id;
      setWorkspaceSyncStatus("saved");
      setAuthLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_IN" && nextSession && researchHydratedUserRef.current === nextSession.user.id) {
        setSession(nextSession);
        return;
      }
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "SIGNED_OUT") {
        if (event !== "SIGNED_OUT") setAuthLoading(true);
        window.setTimeout(() => {
          void applySession(nextSession);
        }, 0);
      } else {
        setSession(nextSession);
      }
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (event === "SIGNED_OUT") setShowAccount(false);
    });

    restorePersistedSession()
      .then((persistedSession) => {
        void applySession(persistedSession);
      })
      .catch(() => {
        void applySession(null);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionUserId || researchHydratedUserRef.current !== sessionUserId) return;
    void queueResearchPersistence(missionResearch);
  }, [missionResearch, queueResearchPersistence, sessionUserId]);

  useEffect(() => {
    if (!showAccount) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setShowAccount(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccount(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showAccount]);

  useEffect(() => {
    const gmailResult = new URLSearchParams(window.location.search).get("gmail");
    if (!gmailResult) return;
    window.history.replaceState({}, "", window.location.pathname);
    const openTimer = window.setTimeout(() => {
      if (gmailResult === "connected") {
        setShowEmailCampaign(true);
        setToast("Gmail connected · review your email plan before authorizing anything");
      } else if (gmailResult === "denied") {
        setToast("Gmail connection was cancelled · no access was granted");
      } else {
        setToast("Gmail could not be connected. Check the OAuth callback and server configuration");
      }
    }, 0);
    const closeTimer = window.setTimeout(() => setToast(""), 4200);
    return () => { window.clearTimeout(openTimer); window.clearTimeout(closeTimer); };
  }, []);

  const mission = useMemo(
    () => missions.find((item) => item.id === activeMissionId) ?? missions[0] ?? starterMission,
    [activeMissionId, missions],
  );
  const activeResearch = missionResearch[mission.id] ?? emptyResearch();
  const contacts = activeResearch.contacts;
  const { plan, error: aiError, discovered, isPlanning, isDiscovering, isRefining, contacted, strategyNotes } = activeResearch;
  const filteredContacts = useMemo(() => contacts.filter((contact) => {
    const matchesType = filter === "All" || contact.type === filter;
    const haystack = `${contact.name} ${contact.role} ${contact.company}`.toLowerCase();
    return matchesType && haystack.includes(query.toLowerCase());
  }), [contacts, filter, query]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const updateMissionResearch = (
    missionId: string,
    update: (current: MissionResearch) => MissionResearch,
  ) => {
    setMissionResearch((current) => ({
      ...current,
      [missionId]: update(current[missionId] ?? emptyResearch()),
    }));
  };

  const persistMissionWorkspace = (nextMissions: Mission[], nextActiveMissionId: string) => {
    const workspace: StoredMissionWorkspace = {
      version: 1,
      missions: nextMissions,
      activeMissionId: nextActiveMissionId,
    };

    missionSaveQueueRef.current = missionSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const { error } = await supabase.auth.updateUser({
          data: { [MISSION_METADATA_KEY]: workspace },
        });
        if (error) throw error;
      })
      .catch(() => {
        notify("Mission changed, but it could not be saved to your account");
      });
  };

  const persistOutreachProfile = (profile: UserOutreachProfile) => {
    missionSaveQueueRef.current = missionSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const { error } = await supabase.auth.updateUser({
          data: { [OUTREACH_PROFILE_METADATA_KEY]: profile },
        });
        if (error) throw error;
      })
      .catch(() => {
        notify("Outreach settings changed, but they could not be saved to your account");
      });
  };

  const saveMissionContext = (context: string) => {
    const cleanedContext = cleanMissionField(context, 2500);
    const nextMissions = missions.map((item) => item.id === mission.id ? { ...item, context: cleanedContext } : item);
    setMissions(nextMissions);
    persistMissionWorkspace(nextMissions, mission.id);
    notify(cleanedContext ? "Mission context saved · your progress is unchanged" : "Mission context removed · your progress is unchanged");
  };

  const saveOutreachSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const requestedLimit = Number(data.get("linkedinConnectionLimit"));
    const requestedWorkflow = cleanMissionField(data.get("linkedinWorkflow"), 40);
    const profile: UserOutreachProfile = {
      version: 1,
      name: cleanMissionField(data.get("name"), 120),
      role: cleanMissionField(data.get("role"), 160),
      organization: cleanMissionField(data.get("organization"), 160),
      background: cleanMissionField(data.get("background"), 1600),
      preferredLanguage: cleanMissionField(data.get("preferredLanguage"), 80) || "English",
      linkedinConnectionLimit: requestedLimit === 0 || requestedLimit === 300 ? requestedLimit : 200,
      linkedinWorkflow: requestedWorkflow === "direct_when_available" || requestedWorkflow === "either" ? requestedWorkflow : "connect_first",
    };
    setUserOutreachProfile(profile);
    persistOutreachProfile(profile);
    setShowOutreachSettings(false);
    notify("Outreach settings saved");
  };

  const selectMission = (missionId: string) => {
    if (missionId === mission.id) return;
    setActiveMissionId(missionId);
    setSelected(null);
    setFilter("All");
    setQuery("");
    setStrategyOpen(true);
    setCandidateListOpen(true);
    persistMissionWorkspace(missions, missionId);
    notify("Mission switched");
  };

  const buildPlan = async (targetMission: Mission, previousResearch?: MissionResearch) => {
    const targetMissionId = targetMission.id;
    const researchContext = previousResearch ?? missionResearch[targetMissionId] ?? emptyResearch();
    const refiningExistingPlan = Boolean(researchContext.plan);
    updateMissionResearch(targetMissionId, (current) => ({
      ...current,
      isPlanning: true,
      error: "",
    }));

    try {
      const response = await fetch("/api/ai/research", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session?.access_token ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(refiningExistingPlan && researchContext.plan ? {
          mission: targetMission,
          stage: "refine",
          plan: researchContext.plan,
          strategyNotes: researchContext.strategyNotes,
          contactedProfiles: researchContext.contacts
            .filter((contact) => researchContext.contacted.includes(contact.id))
            .map((contact) => ({ name: contact.name, role: contact.role, company: contact.company, sector: contact.sector })),
        } : { mission: targetMission, stage: "plan" }),
      });
      const result = await response.json() as PlanResponse | { error?: string };
      if (!response.ok || !("plan" in result)) {
        throw new Error("error" in result && result.error ? result.error : "The strategic plan could not be completed.");
      }

      updateMissionResearch(targetMissionId, (current) => ({
        ...current,
        plan: { ...result.plan, model: result.model },
        error: "",
        isPlanning: false,
      }));
      notify("Strategic action plan ready");
    } catch (planningError) {
      const message = planningError instanceof Error ? planningError.message : "The strategic plan could not be completed.";
      updateMissionResearch(targetMissionId, (current) => ({
        ...current,
        error: message,
        isPlanning: false,
      }));
      notify("The action plan needs your attention");
    }
  };

  const findContacts = async (extraInstructions = "") => {
    if (!plan) {
      await buildPlan(mission);
      return;
    }

    const researchMissionId = mission.id;
    const researchMission = mission;
    setQuery("");
    setFilter("All");
    setCandidateListOpen(true);
    updateMissionResearch(researchMissionId, (current) => ({
      ...current,
      isDiscovering: true,
      error: "",
    }));
    try {
      const existingContacts = [...contacts];
      const requestedTotal = existingContacts.length === 0 ? 50 : Math.min(200, existingContacts.length + 25);
      const maxBatches = existingContacts.length === 0 ? 3 : 2;
      const gathered: Contact[] = [];
      const knownKeys = new Set(existingContacts.map((contact) => `${contact.name}|${contact.company}`.toLowerCase()));

      for (let batch = 0; batch < maxBatches && existingContacts.length + gathered.length < requestedTotal; batch += 1) {
        const response = await fetch("/api/ai/research", {
          method: "POST",
          headers: {
            authorization: `Bearer ${session?.access_token ?? ""}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            mission: researchMission,
            stage: "contacts",
            plan,
            batchSize: Math.min(20, requestedTotal - existingContacts.length - gathered.length),
            existingNames: [...existingContacts, ...gathered].map((contact) => `${contact.name} — ${contact.company}`),
            extraInstructions,
            outreachProfile: userOutreachProfile,
          }),
        });
        const result = await response.json() as ContactResearchResponse | { error?: string };
        if (!response.ok || !("profiles" in result)) {
          if (gathered.length > 0) break;
          throw new Error("error" in result && result.error ? result.error : "AI research could not be completed.");
        }

        const colors = ["coral", "mint", "blue", "yellow", "lilac", "pink"];
        const batchContacts: Contact[] = result.profiles.flatMap((profile, index) => {
          const key = `${profile.name}|${profile.company}`.toLowerCase();
          if (knownKeys.has(key)) return [];
          knownKeys.add(key);
          return [{
            id: Date.now() + batch * 100 + index,
            initials: profile.initials,
            name: profile.name,
            role: profile.role,
            company: profile.company,
            sector: profile.sector,
            reason: profile.reason,
            angle: profile.angle,
            fit: profile.fit,
            type: profile.type,
            color: colors[(existingContacts.length + gathered.length + index) % colors.length],
            warm: profile.searchPath,
            message: profile.message,
            sourceUrl: profile.sourceUrl,
            linkedinUrl: profile.linkedinUrl,
            contactMethod: profile.contactMethod,
            contactUrl: profile.contactUrl,
            publicEmail: profile.publicEmail,
            aiGenerated: true,
          }];
        });
        gathered.push(...batchContacts);
        if (batchContacts.length === 0) break;
      }

      updateMissionResearch(researchMissionId, (current) => ({
        ...current,
        contacts: [...current.contacts, ...gathered].slice(0, 200),
        error: "",
        discovered: current.contacts.length + gathered.length > 0,
        isDiscovering: false,
      }));
      setSelected(null);
      setCandidateListOpen(true);
      notify(gathered.length ? `${gathered.length} new verified profiles added` : "No new verified profiles found");
    } catch (researchError) {
      const message = researchError instanceof Error ? researchError.message : "AI research could not be completed.";
      updateMissionResearch(researchMissionId, (current) => ({
        ...current,
        error: message,
        isDiscovering: false,
      }));
      notify("AI research needs your attention");
    }
  };

  const generateOutreach = async (contact: Contact, force = false) => {
    if ((!force && contact.outreach) || outreachRequestsRef.current.has(contact.id)) return;
    outreachRequestsRef.current.add(contact.id);
    setGeneratingOutreachId(contact.id);
    try {
      const response = await fetch("/api/ai/research", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session?.access_token ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mission,
          stage: "outreach",
          contact: {
            name: contact.name,
            role: contact.role,
            company: contact.company,
            sector: contact.sector,
            angle: contact.angle,
            reason: contact.reason,
            linkedinUrl: contact.linkedinUrl ?? "",
            contactUrl: contact.contactUrl ?? "",
            contactMethod: contact.contactMethod ?? "",
            publicEmail: contact.publicEmail ?? "",
          },
          outreachProfile: userOutreachProfile,
        }),
      });
      const result = await response.json() as OutreachResponse | { error?: string };
      if (!response.ok || !("outreach" in result)) {
        throw new Error("error" in result && result.error ? result.error : "Tailored outreach could not be prepared.");
      }
      const updatedContact = { ...contact, outreach: result.outreach };
      updateMissionResearch(mission.id, (current) => ({
        ...current,
        contacts: current.contacts.map((item) => item.id === contact.id ? updatedContact : item),
      }));
      setSelected((current) => current?.id === contact.id ? updatedContact : current);
      notify("Channel-specific outreach ready");
    } catch (outreachError) {
      const message = outreachError instanceof Error ? outreachError.message : "Tailored outreach could not be prepared.";
      notify(message);
    } finally {
      outreachRequestsRef.current.delete(contact.id);
      setGeneratingOutreachId((current) => current === contact.id ? null : current);
    }
  };

  const enrichPublishedEmails = async () => {
    const candidates = contacts.filter((contact) => !contact.publicEmail);
    if (candidates.length === 0 || isEnrichingEmails) return;
    setIsEnrichingEmails(true);
    try {
      const verified = new Map<number, { publicEmail: string; sourceUrl: string }>();
      for (let offset = 0; offset < candidates.length; offset += 20) {
        const batch = candidates.slice(offset, offset + 20);
        const response = await fetch("/api/ai/research", {
          method: "POST",
          headers: {
            authorization: `Bearer ${session?.access_token ?? ""}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            mission,
            stage: "email_enrichment",
            contacts: batch.map((contact) => ({
              contactId: String(contact.id),
              name: contact.name,
              role: contact.role,
              company: contact.company,
              sourceUrl: contact.sourceUrl ?? "",
              contactUrl: contact.contactUrl ?? "",
            })),
          }),
        });
        const result = await response.json() as EmailEnrichmentResponse | { error?: string };
        if (!response.ok || !("results" in result)) {
          throw new Error("error" in result && result.error ? result.error : "Published emails could not be verified.");
        }
        result.results.forEach((item) => {
          const contactId = Number(item.contactId);
          if (Number.isSafeInteger(contactId)) verified.set(contactId, { publicEmail: item.publicEmail, sourceUrl: item.sourceUrl });
        });
      }

      if (verified.size > 0) {
        updateMissionResearch(mission.id, (current) => ({
          ...current,
          contacts: current.contacts.map((contact) => {
            const match = verified.get(contact.id);
            return match ? { ...contact, publicEmail: match.publicEmail, emailSourceUrl: match.sourceUrl, outreach: undefined } : contact;
          }),
        }));
        setSelected((current) => {
          if (!current) return current;
          const match = verified.get(current.id);
          return match ? { ...current, publicEmail: match.publicEmail, emailSourceUrl: match.sourceUrl, outreach: undefined } : current;
        });
        notify(`${verified.size} published professional email${verified.size === 1 ? "" : "s"} verified and saved`);
      } else {
        notify("No additional published professional emails could be verified");
      }
    } catch (enrichmentError) {
      notify(enrichmentError instanceof Error ? enrichmentError.message : "Published emails could not be verified.");
    } finally {
      setIsEnrichingEmails(false);
    }
  };

  const openContact = (contact: Contact) => {
    setSelected(contact);
    if (!contact.outreach) void generateOutreach(contact);
  };

  const addStrategyNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!noteSector || !plan) return;
    const data = new FormData(event.currentTarget);
    const text = cleanMissionField(data.get("note"), 700);
    if (!text) return;
    const nextNotes = [...strategyNotes, { id: crypto.randomUUID(), sector: noteSector, text, createdAt: new Date().toISOString() }];
    updateMissionResearch(mission.id, (current) => ({ ...current, strategyNotes: nextNotes, isRefining: true, error: "" }));
    setNoteSector(null);
    notify("Learning saved · updating the strategy");

    try {
      const response = await fetch("/api/ai/research", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session?.access_token ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mission,
          stage: "refine",
          plan,
          strategyNotes: nextNotes,
          contactedProfiles: contacts.filter((contact) => contacted.includes(contact.id)).map((contact) => ({ name: contact.name, role: contact.role, company: contact.company, sector: contact.sector })),
        }),
      });
      const result = await response.json() as PlanResponse | { error?: string };
      if (!response.ok || !("plan" in result)) {
        throw new Error("error" in result && result.error ? result.error : "The strategy could not be updated.");
      }
      updateMissionResearch(mission.id, (current) => ({ ...current, plan: { ...result.plan, model: result.model }, isRefining: false, error: "" }));
      notify("Strategy updated from your latest learning");
    } catch (refineError) {
      const message = refineError instanceof Error ? refineError.message : "The strategy could not be updated.";
      updateMissionResearch(mission.id, (current) => ({ ...current, isRefining: false, error: message }));
      notify("The learning was saved, but the strategy was not updated");
    }
  };

  const markContacted = (id: number) => {
    if (!contacted.includes(id)) {
      updateMissionResearch(mission.id, (current) => ({
        ...current,
        contacted: [...current.contacted, id],
      }));
    }
    setSelected(null);
    notify("Contact moved to follow-up");
  };

  const saveMission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = {
      title: cleanMissionField(data.get("idea"), 600),
      audience: cleanMissionField(data.get("audience"), 400),
      question: cleanMissionField(data.get("question"), 400),
    };
    if (!fields.title || !fields.audience || !fields.question || !missionModalMode) return;

    if (missionModalMode === "edit") {
      const updatedMission = { ...mission, ...fields };
      const nextMissions = missions.map((item) => item.id === mission.id ? updatedMission : item);
      setMissions(nextMissions);
      persistMissionWorkspace(nextMissions, mission.id);
      notify("Mission updated · preserving progress while the strategy adapts");
      void buildPlan(updatedMission, activeResearch);
    } else {
      const newMission: Mission = {
        id: crypto.randomUUID(),
        context: "",
        ...fields,
      };
      const nextMissions = [newMission, ...missions];
      setMissions(nextMissions);
      setActiveMissionId(newMission.id);
      setMissionResearch((current) => ({ ...current, [newMission.id]: emptyResearch() }));
      persistMissionWorkspace(nextMissions, newMission.id);
      notify("Mission created · building the action plan");
      void buildPlan(newMission);
    }

    setMissionModalMode(null);
    setSelected(null);
    setFilter("All");
    setQuery("");
  };

  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* Clipboard can be unavailable in previews. */ }
    notify(`${label} copied`);
  };

  const finishRecovery = () => {
    setRecoveryMode(false);
    window.history.replaceState({}, "", window.location.pathname);
    notify("Password updated successfully");
  };

  const signOut = async () => {
    try {
      await queueResearchPersistence(missionResearch, true);
      await Promise.all([missionSaveQueueRef.current, researchSaveQueueRef.current]);
    } catch {
      notify("We couldn't save your latest changes, so you are still signed in");
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      notify("Sign out could not be completed");
      return;
    }
    setShowAccount(false);
  };

  if (authLoading) return <AuthLoading />;

  if (!session || recoveryMode) {
    return (
      <AuthScreen
        initialMode={recoveryMode ? "reset" : "signin"}
        onRecoveryComplete={finishRecovery}
      />
    );
  }

  const accountEmail = session.user.email ?? "Your account";
  const accountInitials = accountEmail.slice(0, 2).toUpperCase();

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="100 Calls">
          <span className="brand-mark">100</span>
          <span>CALLS</span>
        </div>
        <button className="new-mission" onClick={() => setMissionModalMode("new")}><span>+</span> New mission</button>
        <section className="mission-library" aria-label="Saved missions">
          <button
            className="mission-library-toggle"
            onClick={() => setMissionListOpen((open) => !open)}
            aria-expanded={missionListOpen}
          >
            <span>Missions</span><b>{missions.length}</b><i>{missionListOpen ? "−" : "+"}</i>
          </button>
          {missionListOpen && (
            <div className="mission-library-list">
              {missions.map((item, index) => (
                <button
                  className={`mission-library-item ${item.id === mission.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => selectMission(item.id)}
                  aria-current={item.id === mission.id ? "true" : undefined}
                >
                  <span>{String(missions.length - index).padStart(2, "0")}</span>
                  <strong>{item.title}</strong>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="sidebar-bottom">
          <div className="goal-label"><p>Mission progress</p><strong>{contacted.length} / 100</strong></div>
          <div className="progress-track"><span style={{ width: `${contacted.length}%` }} /></div>
          <small>{contacts.length} candidates · {strategyNotes.length} learnings</small>
          <small className={`workspace-sync workspace-sync-${workspaceSyncStatus}`}>
            <i aria-hidden="true" />
            {workspaceSyncStatus === "saving" ? "Saving changes…" : workspaceSyncStatus === "saved" ? "All changes saved" : workspaceSyncStatus === "error" ? "Changes not saved" : "Loading saved work…"}
          </small>
        </div>
      </aside>

      <div className="mobile-header">
        <div className="brand"><span className="brand-mark">100</span><span>CALLS</span></div>
        <div className="mobile-header-controls">
          <select aria-label="Select mission" value={mission.id} onChange={(event) => selectMission(event.target.value)}>
            {missions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </div>
      </div>

      <section className="workspace">
        {workspaceStorageError && (
          <div className="storage-save-error" role="alert">
            <span>!</span><div><strong>Changes are not being saved</strong><small>{workspaceStorageError}</small></div>
          </div>
        )}
        <div className="account-menu-wrap" ref={accountMenuRef}>
          <button className="account-button" onClick={() => setShowAccount((open) => !open)} aria-expanded={showAccount} aria-label="Open account menu">
            <span>{accountInitials}</span><small>{accountEmail}</small><b>⌄</b>
          </button>
          {showAccount && (
            <div className="account-menu">
              <span className="eyebrow">SIGNED IN AS</span>
              <strong>{accountEmail}</strong>
              <button onClick={() => { setShowAccount(false); setShowOutreachSettings(true); }}>Outreach settings</button>
              <button onClick={() => { setShowAccount(false); setRecoveryMode(true); }}>Change password</button>
              <button onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
        <MissionWorkspace
          mission={mission}
          plan={plan}
          contacts={filteredContacts}
          totalContacts={contacts.length}
          emailContactCount={contacts.filter((contact) => contact.publicEmail).length}
          contacted={contacted}
          strategyNotes={strategyNotes}
          aiError={aiError}
          isPlanning={isPlanning}
          isDiscovering={isDiscovering}
          isRefining={isRefining}
          discovered={discovered}
          strategyOpen={strategyOpen}
          candidateListOpen={candidateListOpen}
          query={query}
          filter={filter}
          onBuildPlan={() => buildPlan(mission)}
          onEditMission={() => setMissionModalMode("edit")}
          onSaveContext={saveMissionContext}
          onToggleStrategy={() => setStrategyOpen((open) => !open)}
          onToggleCandidates={() => setCandidateListOpen((open) => !open)}
          onAddNote={setNoteSector}
          onFind={() => findContacts("")}
          onExpand={() => setExpansionOpen(true)}
          onQuery={setQuery}
          onFilter={setFilter}
          onSelect={openContact}
          onPlanEmail={() => setShowEmailCampaign(true)}
        />
      </section>

      {selected && (
        <ContactDrawer
          contact={selected}
          isContacted={contacted.includes(selected.id)}
          isGenerating={generatingOutreachId === selected.id}
          linkedinConnectionLimit={userOutreachProfile.linkedinConnectionLimit}
          onClose={() => setSelected(null)}
          onCopy={copyText}
          onGenerate={() => void generateOutreach(selected, true)}
          onContact={() => markContacted(selected.id)}
        />
      )}

      {showOutreachSettings && (
        <OutreachSettingsModal
          profile={userOutreachProfile}
          onClose={() => setShowOutreachSettings(false)}
          onSave={saveOutreachSettings}
        />
      )}

      {showEmailCampaign && (
        <EmailCampaignModal
          accessToken={session.access_token}
          mission={mission}
          contacts={contacts}
          profile={userOutreachProfile}
          isVerifyingEmails={isEnrichingEmails}
          onVerifyEmails={() => void enrichPublishedEmails()}
          onClose={() => setShowEmailCampaign(false)}
          onNotify={notify}
        />
      )}

      {missionModalMode && (
        <MissionModal
          mode={missionModalMode}
          mission={missionModalMode === "edit" ? mission : null}
          onClose={() => setMissionModalMode(null)}
          onSave={saveMission}
        />
      )}
      {noteSector && (
        <StrategyNoteModal
          sector={noteSector}
          onClose={() => setNoteSector(null)}
          onSave={addStrategyNote}
        />
      )}
      {expansionOpen && (
        <ExpansionModal
          currentCount={contacts.length}
          onClose={() => setExpansionOpen(false)}
          onExpand={(instructions) => {
            setExpansionOpen(false);
            void findContacts(instructions);
          }}
        />
      )}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function groupContactsBySector(contacts: Contact[]): Array<[string, Contact[]]> {
  const grouped = new Map<string, Contact[]>();
  contacts.forEach((contact) => grouped.set(contact.sector, [...(grouped.get(contact.sector) ?? []), contact]));
  return [...grouped.entries()];
}

function MissionWorkspace({
  mission,
  plan,
  contacts,
  totalContacts,
  emailContactCount,
  contacted,
  strategyNotes,
  aiError,
  isPlanning,
  isDiscovering,
  isRefining,
  discovered,
  strategyOpen,
  candidateListOpen,
  query,
  filter,
  onBuildPlan,
  onEditMission,
  onSaveContext,
  onToggleStrategy,
  onToggleCandidates,
  onAddNote,
  onFind,
  onExpand,
  onQuery,
  onFilter,
  onSelect,
  onPlanEmail,
}: {
  mission: Mission;
  plan: ActionPlan | null;
  contacts: Contact[];
  totalContacts: number;
  emailContactCount: number;
  contacted: number[];
  strategyNotes: StrategyNote[];
  aiError: string;
  isPlanning: boolean;
  isDiscovering: boolean;
  isRefining: boolean;
  discovered: boolean;
  strategyOpen: boolean;
  candidateListOpen: boolean;
  query: string;
  filter: string;
  onBuildPlan: () => void;
  onEditMission: () => void;
  onSaveContext: (context: string) => void;
  onToggleStrategy: () => void;
  onToggleCandidates: () => void;
  onAddNote: (sector: string) => void;
  onFind: () => void;
  onExpand: () => void;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (contact: Contact) => void;
  onPlanEmail: () => void;
}) {
  return (
    <div className="mission-flow">
      <section className="objective-panel">
        <div className="flow-number">01</div>
        <div className="objective-copy">
          <span className="eyebrow">OBJECTIVE</span>
          <h1 className={`objective-title ${mission.title.length > 220 ? "very-long" : mission.title.length > 130 ? "long" : ""}`}>{mission.title}</h1>
          <p><strong>People:</strong> {mission.audience}</p>
          <p><strong>What to learn:</strong> {mission.question}</p>
        </div>
        <button className="edit-objective" onClick={onEditMission}><span>✎</span>Edit objective</button>
        <MissionContextPanel key={`${mission.id}:${mission.context}`} mission={mission} onSave={onSaveContext} />
      </section>

      {aiError && <div className="workspace-error" role="alert"><span>!</span><p>{aiError}</p></div>}

      {isPlanning && (
        <section className="flow-loading" aria-live="polite">
          <i className="spinner dark" />
          <div>
            <strong>{plan ? "Updating the contact strategy" : "Building the contact strategy"}</strong>
            <p>{plan ? "Keeping every contact, learning and follow-up while the plan adapts." : "Mapping sectors, roles, learning value and interview order."}</p>
          </div>
        </section>
      )}

      {!plan && !isPlanning && (
        <section className="flow-empty">
          <div className="flow-number">02</div>
          <div><span className="eyebrow">CONTACT STRATEGY</span><h2>Start with a clear map, not a random list.</h2><p>GPT will justify which sectors to approach, what each group can teach you, and the order in which to contact them.</p></div>
          <button className="primary-button" onClick={onBuildPlan}>Create strategy <span>→</span></button>
        </section>
      )}

      {plan && (
        <LivingStrategy
          plan={plan}
          notes={strategyNotes}
          isOpen={strategyOpen}
          isRefining={isRefining}
          onToggle={onToggleStrategy}
          onAddNote={onAddNote}
        />
      )}

      {plan && (
        <CandidatePool
          contacts={contacts}
          total={totalContacts}
          emailContactCount={emailContactCount}
          contacted={contacted}
          isOpen={candidateListOpen}
          isDiscovering={isDiscovering}
          discovered={discovered}
          query={query}
          filter={filter}
          onToggle={onToggleCandidates}
          onFind={onFind}
          onExpand={onExpand}
          onQuery={onQuery}
          onFilter={onFilter}
          onSelect={onSelect}
          onPlanEmail={onPlanEmail}
        />
      )}
    </div>
  );
}

function LivingStrategy({ plan, notes, isOpen, isRefining, onToggle, onAddNote }: {
  plan: ActionPlan;
  notes: StrategyNote[];
  isOpen: boolean;
  isRefining: boolean;
  onToggle: () => void;
  onAddNote: (sector: string) => void;
}) {
  return (
    <section className="flow-section strategy-section">
      <button className="flow-section-header" onClick={onToggle} aria-expanded={isOpen}>
        <span className="flow-number">02</span>
        <span className="flow-heading-copy"><span className="eyebrow">LIVING CONTACT STRATEGY</span><strong>{plan.segments.length} routes to evidence</strong><small>{notes.length ? `${notes.length} field learning${notes.length === 1 ? "" : "s"} shaping this plan` : "Add learnings as conversations happen; the plan will adapt."}</small></span>
        {isRefining && <span className="updating-label"><i className="spinner dark" /> Updating</span>}
        <span className="collapse-label">{isOpen ? "Collapse" : "Open"} <b>{isOpen ? "−" : "+"}</b></span>
      </button>

      {isOpen && (
        <div className="strategy-body">
          <div className="strategy-thesis">
            <div><span>Objective</span><p>{plan.objective}</p></div>
            <div><span>Riskiest assumption</span><p>{plan.hypothesis}</p></div>
            <strong>{plan.recommendedInterviews}<small>recommended conversations</small></strong>
          </div>

          <div className="strategy-map">
            {plan.segments.map((segment, index) => {
              const sectorNotes = notes.filter((note) => note.sector === segment.sector);
              return (
                <article className="strategy-route" key={segment.sector}>
                  <div className="route-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="route-main">
                    <div className="route-title"><div><span className={`priority priority-${segment.priority.toLowerCase()}`}>{segment.priority}</span><h3>{segment.sector}</h3></div><strong>{segment.targetCount} calls</strong></div>
                    <div className="role-chips">{segment.roles.map((role) => <span key={role}>{role}</span>)}</div>
                    <div className="route-rationale"><div><span>Why this sector</span><p>{segment.why}</p></div><div><span>What it unlocks</span><p>{segment.learningGoal}</p></div><div><span>How to reach it</span><p>{segment.searchApproach}</p></div></div>
                    {sectorNotes.length > 0 && (
                      <div className="field-notes"><span>FIELD LEARNINGS</span>{sectorNotes.map((note) => <p key={note.id}><i />{note.text}</p>)}</div>
                    )}
                    <button className="add-learning" onClick={() => onAddNote(segment.sector)}>+ Add learning from a conversation</button>
                  </div>
                </article>
              );
            })}
          </div>

          <details className="strategy-details">
            <summary>Open execution guide and interview questions <span>+</span></summary>
            <div className="strategy-details-grid">
              <div><span className="eyebrow">SEQUENCE</span><ol>{plan.sequence.map((step, index) => <li key={`${step.title}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{step.title}</strong><p>{step.detail}</p><small>{step.outcome}</small></div></li>)}</ol></div>
              <div><span className="eyebrow">INTERVIEW GUIDE</span><ol className="compact-questions">{plan.questions.map((question, index) => <li key={`${question}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><p>{question}</p></li>)}</ol></div>
            </div>
            <div className="decision-strip"><span>Decision criteria</span>{plan.successCriteria.map((criterion) => <p key={criterion}>✓ {criterion}</p>)}</div>
          </details>
        </div>
      )}
    </section>
  );
}

function CandidatePool({ contacts, total, emailContactCount, contacted, isOpen, isDiscovering, discovered, query, filter, onToggle, onFind, onExpand, onQuery, onFilter, onSelect, onPlanEmail }: {
  contacts: Contact[];
  total: number;
  emailContactCount: number;
  contacted: number[];
  isOpen: boolean;
  isDiscovering: boolean;
  discovered: boolean;
  query: string;
  filter: string;
  onToggle: () => void;
  onFind: () => void;
  onExpand: () => void;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (contact: Contact) => void;
  onPlanEmail: () => void;
}) {
  const filters = ["All", "Potential customer", "Founder", "Expert"];
  const groupedContacts = groupContactsBySector(contacts);
  return (
    <section className="flow-section candidate-section">
      <button className="flow-section-header" onClick={onToggle} aria-expanded={isOpen}>
        <span className="flow-number">03</span>
        <span className="flow-heading-copy"><span className="eyebrow">CANDIDATE POOL</span><strong>{total ? `${total} verified people` : "50–200 relevant people"}</strong><small>Grouped by sector, with LinkedIn and public contact routes when available.</small></span>
        <span className="candidate-progress"><b>{total}</b><i><span style={{ width: `${Math.min(100, (total / 200) * 100)}%` }} /></i><small>max 200</small></span>
        <span className="collapse-label">{isOpen ? "Collapse" : "Open"} <b>{isOpen ? "−" : "+"}</b></span>
      </button>

      {isOpen && (
        <div className="candidate-body">
          {total === 0 ? (
            <div className="candidate-empty">
              <div><strong>No placeholder profiles.</strong><p>Build the first pool from public professional sources. GPT will work in verified batches toward 50 candidates.</p></div>
              <button className="primary-button" onClick={onFind} disabled={isDiscovering}>{isDiscovering ? <><i className="spinner" /> Building the pool</> : <>Build first 50 candidates <span>→</span></>}</button>
            </div>
          ) : (
            <>
              <div className="candidate-toolbar">
                <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search name, role or company" /></label>
                <div className="filter-row">{filters.map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => onFilter(item)}>{item}</button>)}</div>
                <button className="email-plan-button" onClick={onPlanEmail}><span>@</span> {emailContactCount ? "Plan email outreach" : "Find published emails"} <b>{emailContactCount}</b></button>
              </div>

              {groupedContacts.length ? groupedContacts.map(([sector, sectorContacts]) => (
                <section className="candidate-sector" key={sector}>
                  <header><h3>{sector}</h3><span>{sectorContacts.length}</span></header>
                  <div className="candidate-list">
                    {sectorContacts.map((contact) => (
                      <button className="candidate-row" key={contact.id} onClick={() => onSelect(contact)}>
                        <span className={`contact-avatar small ${contact.color}`}>{contact.initials}</span>
                        <span className="candidate-person"><strong>{contact.name}</strong><small>{contact.role} · {contact.company}</small></span>
                        <span className="candidate-value">{contact.reason}</span>
                        <span className="candidate-links">{contact.linkedinUrl && <i>in</i>}{contact.publicEmail && <b>Email</b>}{contact.contactUrl && !contact.publicEmail && <b>Contact</b>}</span>
                        <span className={`status ${contacted.includes(contact.id) ? "done" : ""}`}><i />{contacted.includes(contact.id) ? "Contacted" : "Pending"}</span>
                        <span className="row-arrow">→</span>
                      </button>
                    ))}
                  </div>
                </section>
              )) : <div className="empty-state"><strong>No matches found</strong><p>Try a broader search or another contact type.</p></div>}

              <footer className="expand-pool">
                <div><span className="eyebrow">KEEP DISCOVERING</span><strong>{total < 50 ? `${50 - total} more profiles to reach the initial pool` : `${200 - total} spaces remain in this mission`}</strong><p>Every expansion keeps the existing list and avoids duplicate people.</p></div>
                {total < 200 && <button className="primary-button" onClick={onExpand} disabled={isDiscovering}>{isDiscovering ? <><i className="spinner" /> Researching more</> : <>Expand list <span>+</span></>}</button>}
              </footer>
            </>
          )}
          {isDiscovering && total > 0 && <div className="research-progress" role="status"><i className="spinner dark" /><span>Searching and verifying another batch. Existing candidates stay in place.</span></div>}
          {discovered && <p className="source-note">Profiles are based on public professional sources. Verify the current role before outreach.</p>}
        </div>
      )}
    </section>
  );
}

function StrategyNoteModal({ sector, onClose, onSave }: {
  sector: string;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="note-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <form className="mission-modal small-modal" onSubmit={onSave}>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close modal">×</button>
        <span className="step-label">FIELD LEARNING · {sector.toUpperCase()}</span>
        <h2 id="note-title">What changed after this conversation?</h2>
        <p className="modal-intro">Add one concrete signal, contradiction or new question. It will remain beside this sector and update the strategy.</p>
        <label>Learning<textarea name="note" required maxLength={700} rows={5} placeholder="Example: operators care more about recovery time than coordination accuracy…" /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Save & update strategy <span>→</span></button></div>
      </form>
    </div>
  );
}

function ExpansionModal({ currentCount, onClose, onExpand }: {
  currentCount: number;
  onClose: () => void;
  onExpand: (instructions: string) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onExpand(cleanMissionField(data.get("instructions"), 700));
  };
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="expand-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <form className="mission-modal small-modal" onSubmit={submit}>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close modal">×</button>
        <span className="step-label">EXPAND CANDIDATE POOL · {currentCount}/200</span>
        <h2 id="expand-title">Any extra direction for this expansion?</h2>
        <p className="modal-intro">Optional. Narrow the geography, add a sector, prioritize seniority, or leave it blank to follow the current strategy.</p>
        <label>Extra instruction<textarea name="instructions" maxLength={700} rows={4} placeholder="Example: add European robotics researchers and industrial fleet operators…" /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Find more people <span>→</span></button></div>
      </form>
    </div>
  );
}

function tomorrowInputValue(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function proposedSendTimes(startDate: string, time: string, count: number, dailyLimit: number, skipWeekends: boolean): string[] {
  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const cursor = new Date(year, month - 1, day, hour, minute, 0, 0);
  const times: string[] = [];
  while (times.length < count) {
    if (!skipWeekends || (cursor.getDay() !== 0 && cursor.getDay() !== 6)) {
      for (let index = 0; index < dailyLimit && times.length < count; index += 1) {
        times.push(new Date(cursor.getTime() + index * 12 * 60 * 1000).toISOString());
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return times;
}

function EmailCampaignModal({ accessToken, mission, contacts, profile, isVerifyingEmails, onVerifyEmails, onClose, onNotify }: {
  accessToken: string;
  mission: Mission;
  contacts: Contact[];
  profile: UserOutreachProfile;
  isVerifyingEmails: boolean;
  onVerifyEmails: () => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const eligible = useMemo(() => contacts.filter((contact) => Boolean(contact.publicEmail)), [contacts]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(eligible.map((contact) => contact.id)));
  const [connection, setConnection] = useState<GmailConnection | null>(null);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [savedEmails, setSavedEmails] = useState<ScheduledEmail[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<EmailCampaign | null>(null);
  const [activeEmails, setActiveEmails] = useState<ScheduledEmail[]>([]);
  const [startDate, setStartDate] = useState(tomorrowInputValue);
  const [sendTime, setSendTime] = useState("09:30");
  const [dailyLimit, setDailyLimit] = useState(10);
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedIds((current) => new Set([...current, ...eligible.map((contact) => contact.id)]));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/email/campaigns", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const result = await response.json() as { connection?: GmailConnection; campaigns?: EmailCampaign[]; emails?: ScheduledEmail[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Email scheduling could not be loaded.");
      setConnection(result.connection ?? { connected: false, email: "", connectedAt: "" });
      setCampaigns(result.campaigns ?? []);
      setSavedEmails(result.emails ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Email scheduling could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCampaigns(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCampaigns]);

  const connectGmail = async () => {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/auth/gmail/connect", { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Gmail connection could not start.");
      window.location.assign(result.url);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Gmail connection could not start.");
      setWorking(false);
    }
  };

  const campaignAction = async (action: "approve" | "pause" | "resume" | "cancel" | "disconnect", campaignId?: string) => {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ action, campaignId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The email plan could not be updated.");
      if (action === "approve") onNotify("Email plan authorized · the queue will send at the approved times");
      if (action === "disconnect") onNotify("Gmail disconnected · active campaigns were paused automatically");
      setActiveCampaign(null);
      setActiveEmails([]);
      await loadCampaigns();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The email plan could not be updated.");
    } finally {
      setWorking(false);
    }
  };

  const generatePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = eligible.filter((contact) => selectedIds.has(contact.id));
    if (!connection?.connected) return;
    if (selected.length === 0) {
      setError("Select at least one contact with a published professional email.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const drafts: EmailBatchResponse["drafts"] = [];
      for (let offset = 0; offset < selected.length; offset += 20) {
        const batch = selected.slice(offset, offset + 20);
        const response = await fetch("/api/ai/research", {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            mission,
            stage: "email_batch",
            outreachProfile: profile,
            contacts: batch.map((contact) => ({
              contactId: String(contact.id),
              name: contact.name,
              role: contact.role,
              company: contact.company,
              sector: contact.sector,
              reason: contact.reason,
              angle: contact.angle,
              publicEmail: contact.publicEmail,
            })),
          }),
        });
        const result = await response.json() as EmailBatchResponse | { error?: string };
        if (!response.ok || !("drafts" in result)) throw new Error("error" in result && result.error ? result.error : "The email proposal could not be generated.");
        drafts.push(...result.drafts);
      }
      const draftMap = new Map(drafts.map((draft) => [draft.contactId, draft]));
      const times = proposedSendTimes(startDate, sendTime, selected.length, dailyLimit, skipWeekends);
      const proposedEmails = selected.map((contact, index) => {
        const draft = draftMap.get(String(contact.id));
        if (!draft) throw new Error(`A draft is missing for ${contact.name}.`);
        return {
          contactId: String(contact.id),
          recipientEmail: contact.publicEmail,
          recipientName: contact.name,
          subject: draft.subject,
          body: draft.body,
          scheduledAt: times[index],
        };
      });
      const response = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_draft",
          missionId: mission.id,
          name: `${mission.title.slice(0, 110)} · ${new Date().toLocaleDateString()}`,
          timezone,
          dailyLimit,
          emails: proposedEmails,
        }),
      });
      const result = await response.json() as { campaign?: EmailCampaign; emails?: ScheduledEmail[]; error?: string };
      if (!response.ok || !result.campaign) throw new Error(result.error || "The draft email plan could not be saved.");
      setActiveCampaign(result.campaign);
      setActiveEmails(result.emails ?? []);
      onNotify("Draft email plan ready · nothing has been sent or authorized yet");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "The email proposal could not be generated.");
    } finally {
      setWorking(false);
    }
  };

  const openCampaign = (campaign: EmailCampaign) => {
    setActiveCampaign(campaign);
    setActiveEmails(savedEmails.filter((email) => email.campaign_id === campaign.id));
  };

  return (
    <div className="modal-layer email-campaign-layer" role="dialog" aria-modal="true" aria-labelledby="email-plan-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <section className="mission-modal email-campaign-modal">
        <button type="button" className="close-button" onClick={onClose} aria-label="Close modal">×</button>
        <span className="step-label">APPROVED EMAIL OUTREACH</span>
        <h2 id="email-plan-title">Plan first. Authorize once. Send on schedule.</h2>
        <p className="modal-intro">100 Calls can prepare personalized emails, but Gmail sends nothing until you review the complete plan and authorize it explicitly.</p>

        {loading ? <div className="email-loading"><i className="spinner dark" /> Loading Gmail and campaign status…</div> : (
          <>
            {error && <div className="workspace-error email-error"><span>!</span><p>{error}</p></div>}
            <div className={`gmail-connection ${connection?.connected ? "connected" : ""}`}>
              <div><span>{connection?.connected ? "✓" : "@"}</span><p><strong>{connection?.connected ? "Gmail connected" : "Connect the Gmail account that will send"}</strong><small>{connection?.connected ? connection.email : "Send-only access. 100 Calls cannot read your inbox."}</small></p></div>
              {connection?.connected ? <button onClick={() => void campaignAction("disconnect")} disabled={working}>Disconnect</button> : <button className="primary-button" onClick={connectGmail} disabled={working}>{working ? "Opening Google…" : "Connect Gmail"}<span>→</span></button>}
            </div>

            {activeCampaign ? (
              <div className="campaign-review">
                <div className="campaign-review-heading"><button onClick={() => { setActiveCampaign(null); setActiveEmails([]); }}>← Back</button><span className={`campaign-status status-${activeCampaign.status}`}>{activeCampaign.status}</span></div>
                <h3>{activeCampaign.name}</h3>
                <p>{activeEmails.length} emails · {activeCampaign.daily_limit} per day · times shown in {activeCampaign.timezone}</p>
                <div className="scheduled-email-list">
                  {activeEmails.map((email) => (
                    <details key={email.id} className="scheduled-email">
                      <summary><span><strong>{email.recipient_name}</strong><small>{email.recipient_email}</small></span><span><b>{new Date(email.scheduled_at).toLocaleString()}</b><small>{email.status}</small></span></summary>
                      <div><strong>{email.subject}</strong><p>{email.body}</p>{email.last_error && <small className="email-delivery-error">{email.last_error}</small>}</div>
                    </details>
                  ))}
                </div>
                {activeCampaign.status === "draft" && <div className="authorization-box"><p><strong>Final authorization</strong>By continuing, you authorize 100 Calls to send these {activeEmails.length} emails from {connection?.email} at the listed times. You can cancel the campaign before an email is sent.</p><button className="primary-button" onClick={() => void campaignAction("approve", activeCampaign.id)} disabled={working}>{working ? "Authorizing…" : `Authorize and schedule ${activeEmails.length} emails`} <span>→</span></button></div>}
                {activeCampaign.status === "approved" && <div className="campaign-controls"><button onClick={() => void campaignAction("pause", activeCampaign.id)} disabled={working}>Pause campaign</button><button onClick={() => void campaignAction("cancel", activeCampaign.id)} disabled={working}>Cancel unsent emails</button></div>}
                {activeCampaign.status === "paused" && <div className="campaign-controls"><button className="primary-button" onClick={() => void campaignAction("resume", activeCampaign.id)} disabled={working}>Resume campaign <span>→</span></button><button onClick={() => void campaignAction("cancel", activeCampaign.id)} disabled={working}>Cancel unsent emails</button></div>}
              </div>
            ) : connection?.connected && eligible.length ? (
              <form className="email-plan-form" onSubmit={generatePlan}>
                <div className="email-plan-section">
                  <header><div><span className="eyebrow">1 · RECIPIENTS</span><strong>Choose published professional emails</strong></div><div className="email-recipient-actions"><button type="button" onClick={onVerifyEmails} disabled={isVerifyingEmails || eligible.length === contacts.length}>{isVerifyingEmails ? "Verifying…" : "Verify more emails"}</button><button type="button" onClick={() => setSelectedIds(selectedIds.size === eligible.length ? new Set() : new Set(eligible.map((contact) => contact.id)))}>{selectedIds.size === eligible.length ? "Clear all" : "Select all"}</button></div></header>
                  <div className="email-recipient-grid">{eligible.map((contact) => <label key={contact.id} aria-label={`Include ${contact.name} in the email plan`}><input type="checkbox" checked={selectedIds.has(contact.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(contact.id)) next.delete(contact.id); else next.add(contact.id); return next; })} /><span><strong>{contact.name}</strong><small>{contact.publicEmail}</small></span></label>)}</div>
                </div>
                <div className="email-plan-section">
                  <header><div><span className="eyebrow">2 · CADENCE</span><strong>Set the proposed sending window</strong></div></header>
                  <div className="email-cadence-grid"><label>Start date<input type="date" min={tomorrowInputValue()} value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label>First email each day<input type="time" value={sendTime} onChange={(event) => setSendTime(event.target.value)} required /></label><label>Emails per day<input type="number" min="1" max="50" value={dailyLimit} onChange={(event) => setDailyLimit(Math.min(50, Math.max(1, Number(event.target.value))))} required /></label><label className="weekend-toggle"><input type="checkbox" checked={skipWeekends} onChange={(event) => setSkipWeekends(event.target.checked)} /> Skip weekends</label></div>
                </div>
                <button className="primary-button email-generate-button" disabled={working || selectedIds.size === 0}>{working ? <><i className="spinner" /> Writing and scheduling drafts…</> : <>Generate a reviewable plan for {selectedIds.size} emails <span>→</span></>}</button>
              </form>
            ) : eligible.length === 0 ? <div className="email-no-recipients"><strong>The source pages may publish emails that were not extracted.</strong><p>Run a focused verification across official company, university and professional pages. Existing contacts and progress remain unchanged.</p><button className="primary-button" onClick={onVerifyEmails} disabled={isVerifyingEmails}>{isVerifyingEmails ? <><i className="spinner" /> Verifying official sources…</> : <>Find published emails for this pool <span>→</span></>}</button></div> : null}

            {!activeCampaign && campaigns.filter((campaign) => campaign.mission_id === mission.id).length > 0 && (
              <section className="existing-campaigns"><span className="eyebrow">SAVED EMAIL PLANS</span>{campaigns.filter((campaign) => campaign.mission_id === mission.id).map((campaign) => <button key={campaign.id} onClick={() => openCampaign(campaign)}><span><strong>{campaign.name}</strong><small>{savedEmails.filter((email) => email.campaign_id === campaign.id).length} emails · {new Date(campaign.created_at).toLocaleDateString()}</small></span><b className={`campaign-status status-${campaign.status}`}>{campaign.status}</b><i>→</i></button>)}</section>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export function Radar({ contacts, mission, isPlanning, isDiscovering, discovered, plan, aiError, onBuildPlan, onFind, onSelect, onViewAll, onEditMission }: {
  contacts: Contact[];
  mission: Mission;
  isPlanning: boolean;
  isDiscovering: boolean;
  discovered: boolean;
  plan: ActionPlan | null;
  aiError: string;
  onBuildPlan: () => void;
  onFind: () => void;
  onSelect: (contact: Contact) => void;
  onViewAll: () => void;
  onEditMission: () => void;
}) {
  const groupedContacts = groupContactsBySector(contacts);
  const primaryAction = plan ? onFind : onBuildPlan;
  const actionLabel = isPlanning
    ? "Building your strategy"
    : isDiscovering
      ? "Researching verified profiles"
      : !plan
        ? "Build strategic action plan"
        : discovered
          ? "Explore contact map"
          : "Find people for this plan";

  return (
    <>
      <header className="topbar">
        <div><span className="eyebrow">MISSION WORKSPACE</span><h1>Turn a market question into a contact strategy.</h1></div>
      </header>

      <section className="mission-card">
        <div className="mission-copy">
          <div className="mission-label">
            <span className="pill">ACTIVE MISSION</span>
            <button className="edit-mission-button" onClick={onEditMission}><span>✎</span> Edit mission focus</button>
          </div>
          <h2>{mission.title}</h2>
          <p>We are looking for {mission.audience} to test {mission.question}.</p>
          <small className="ai-note">First build the strategy. Then GPT researches public professional sources and only returns verifiable routes.</small>
          {aiError && <div className="mission-error" role="alert"><span>!</span>{aiError}</div>}
        </div>
        <button className="primary-button mission-primary" onClick={primaryAction} disabled={isPlanning || isDiscovering}>
          {(isPlanning || isDiscovering) && <i className="spinner" />}{actionLabel}{!isPlanning && !isDiscovering && <span>→</span>}
        </button>
      </section>

      <div className="signal-row">
        <div><strong>{plan?.segments.length ?? 0}</strong><span>priority sectors</span></div>
        <div><strong>{plan?.recommendedInterviews ?? 0}</strong><span>target interviews</span></div>
        <div><strong>{contacts.length}</strong><span>verified profiles</span></div>
        <p><span className="pulse" /> {discovered ? "Contact map ready" : plan ? "Strategy ready for research" : "Building from the mission focus"}</p>
      </div>

      {isPlanning && (
        <section className="plan-loading" aria-live="polite">
          <i className="spinner dark" />
          <div><span className="eyebrow">GPT STRATEGIST</span><h2>Designing who to contact, why, and in what order.</h2><p>Defining sectors, target roles, interview sequence, questions, and decision criteria.</p></div>
        </section>
      )}

      {plan && (
        <ActionPlanSection plan={plan} isDiscovering={isDiscovering} discovered={discovered} onFind={onFind} />
      )}

      {!plan && !isPlanning && (
        <section className="plan-empty">
          <span className="plan-empty-number">01</span>
          <div><span className="eyebrow">START WITH STRATEGY</span><h2>Your contact list is intentionally empty.</h2><p>Generate the action plan first. It will define the sectors, roles, sequence, questions, and evidence needed before finding individual people.</p></div>
          <button className="primary-button" onClick={onBuildPlan}>Build action plan <span>→</span></button>
        </section>
      )}

      {groupedContacts.length > 0 && (
        <section className="radar-contact-map">
          <div className="section-heading">
            <div><span className="eyebrow">VERIFIED CONTACT MAP</span><h2>Profiles grouped by sector</h2></div>
            <button className="text-button" onClick={onViewAll}>View full map <span>↗</span></button>
          </div>
          {groupedContacts.map(([sector, sectorContacts]) => (
            <div className="sector-preview" key={sector}>
              <div className="sector-preview-heading"><h3>{sector}</h3><span>{sectorContacts.length} profiles</span></div>
              <div className="contact-grid">
                {sectorContacts.map((contact) => <ContactCard key={contact.id} contact={contact} onSelect={onSelect} />)}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function ActionPlanSection({ plan, isDiscovering, discovered, onFind }: {
  plan: ActionPlan;
  isDiscovering: boolean;
  discovered: boolean;
  onFind: () => void;
}) {
  return (
    <section className="action-plan">
      <header className="action-plan-header">
        <div><span className="eyebrow">STRATEGIC ACTION PLAN</span><h2>{plan.objective}</h2></div>
        <div className="plan-target"><strong>{plan.recommendedInterviews}</strong><span>recommended interviews</span></div>
      </header>

      <div className="plan-hypothesis"><span>RISKIEST ASSUMPTION</span><p>{plan.hypothesis}</p></div>

      <div className="plan-section-title"><span>01</span><div><strong>Who to contact</strong><small>Prioritized sectors and exact roles</small></div></div>
      <div className="segment-grid">
        {plan.segments.map((segment) => (
          <article className="segment-card" key={segment.sector}>
            <div className="segment-top"><span className={`priority priority-${segment.priority.toLowerCase()}`}>{segment.priority}</span><strong>{segment.targetCount} calls</strong></div>
            <h3>{segment.sector}</h3>
            <div className="role-chips">{segment.roles.map((role) => <span key={role}>{role}</span>)}</div>
            <dl><div><dt>Why them</dt><dd>{segment.why}</dd></div><div><dt>Learn</dt><dd>{segment.learningGoal}</dd></div><div><dt>Find them</dt><dd>{segment.searchApproach}</dd></div></dl>
          </article>
        ))}
      </div>

      <div className="plan-detail-grid">
        <section>
          <div className="plan-section-title"><span>02</span><div><strong>Execution sequence</strong><small>Work from assumptions to evidence</small></div></div>
          <ol className="plan-sequence">{plan.sequence.map((step, index) => <li key={`${step.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{step.title}</strong><p>{step.detail}</p><small>OUTPUT · {step.outcome}</small></div></li>)}</ol>
        </section>
        <section>
          <div className="plan-section-title"><span>03</span><div><strong>Interview guide</strong><small>Questions that avoid leading the witness</small></div></div>
          <ol className="plan-questions">{plan.questions.map((question, index) => <li key={`${question}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{question}</li>)}</ol>
        </section>
      </div>

      <footer className="plan-footer">
        <div><span className="eyebrow">DECISION CRITERIA</span><ul>{plan.successCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul><small>Plan generated with {plan.model}</small></div>
        <button className="primary-button" onClick={onFind} disabled={isDiscovering}>{isDiscovering ? <><i className="spinner" /> Researching the web</> : <>{discovered ? "Refresh verified contacts" : "Find verified people"}<span>→</span></>}</button>
      </footer>
    </section>
  );
}

export function ContactsView({ contacts, total, query, filter, contacted, hasPlan, isDiscovering, onQuery, onFilter, onSelect, onFind }: {
  contacts: Contact[];
  total: number;
  query: string;
  filter: string;
  contacted: number[];
  hasPlan: boolean;
  isDiscovering: boolean;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (contact: Contact) => void;
  onFind: () => void;
}) {
  const filters = ["All", "Potential customer", "Founder", "Expert"];
  const groupedContacts = groupContactsBySector(contacts);
  return (
    <>
      <PageHeader eyebrow="PEOPLE MAP" title="Strategic contacts by sector" subtitle={total ? `${total} profiles prioritized for learning value, with verified public sources and contact routes when available.` : "No example profiles. Build the strategy first, then research real people for this mission."} />
      <div className="contact-toolbar">
        <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by name, role, or company" /></label>
        <button className="primary-button compact" onClick={onFind} disabled={isDiscovering}>{isDiscovering ? "Researching…" : total ? "↻ Refresh verified people" : hasPlan ? "Find verified people" : "Build strategy first"}</button>
      </div>
      <div className="filter-row" aria-label="Filter contacts">
        {filters.map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => onFilter(item)}>{item}</button>)}
      </div>
      {groupedContacts.length > 0 ? (
        <div className="sector-list">
          {groupedContacts.map(([sector, sectorContacts]) => (
            <section className="sector-group" key={sector}>
              <header><div><span className="eyebrow">SECTOR</span><h2>{sector}</h2></div><strong>{sectorContacts.length} profiles</strong></header>
              <div className="contact-list">
                {sectorContacts.map((contact) => (
                  <button className="contact-list-row" key={contact.id} onClick={() => onSelect(contact)}>
                    <span className={`contact-avatar ${contact.color}`}>{contact.initials}</span>
                    <span className="contact-person"><strong>{contact.name}</strong><small>{contact.role} · {contact.company}</small></span>
                    <span className="type-tag">{contact.type}</span>
                    <span className="contact-reason">{contact.reason}</span>
                    <span className="available-routes">{contact.linkedinUrl && <i>in</i>}{contact.contactUrl && <b>Contact</b>}</span>
                    <span className={`status ${contacted.includes(contact.id) ? "done" : ""}`}><i />{contacted.includes(contact.id) ? "Contacted" : "Pending"}</span>
                    <span className="fit plain">{contact.fit}%</span>
                    <span className="row-arrow">→</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="empty-state contact-empty"><strong>Your contact map is empty by design</strong><p>Generate the mission strategy, then GPT will find real profiles for its priority sectors.</p><button className="primary-button" onClick={onFind}>{hasPlan ? "Find verified people" : "Build strategic plan"}<span>→</span></button></div>
      ) : <div className="empty-state"><strong>No matches found</strong><p>Try a different name, role, or contact type.</p></div>}
    </>
  );
}

export function MessagesView({ contacts, contacted, onSelect, onCopy }: {
  contacts: Contact[];
  contacted: number[];
  onSelect: (contact: Contact) => void;
  onCopy: (contact: Contact) => void;
}) {
  if (contacts.length === 0) {
    return (
      <>
        <PageHeader eyebrow="HUMAN OUTREACH" title="Messages with context" subtitle="Outreach starts after the strategic plan and verified contact research." />
        <div className="empty-state contact-empty"><strong>No contacts to message yet</strong><p>Return to Radar, generate the action plan, and find verified people first.</p></div>
      </>
    );
  }
  const recommendedContact = contacts[0];
  const recommendedMessage = recommendedContact.message ?? `Hi ${recommendedContact.name.split(" ")[0]}, I'm exploring a way to help SMBs reduce late payments. Your experience at ${recommendedContact.company} feels especially relevant. I'm not trying to sell you anything—would you be open to a 20-minute conversation so I can test what I'm learning?`;
  return (
    <>
      <PageHeader eyebrow="HUMAN OUTREACH" title="Messages with context" subtitle="Personalize the reason, ask for little, and learn a lot." />
      <div className="message-layout">
        <section className="queue-panel">
          <div className="panel-heading"><span>OUTREACH QUEUE</span><b>{contacts.length}</b></div>
          {contacts.map((contact, index) => (
            <button className="queue-row" key={contact.id} onClick={() => onSelect(contact)}>
              <span className="queue-number">{String(index + 1).padStart(2, "0")}</span>
              <span className={`contact-avatar small ${contact.color}`}>{contact.initials}</span>
              <span><strong>{contact.name}</strong><small>{contact.company}</small></span>
              <i className={contacted.includes(contact.id) ? "sent" : ""} />
            </button>
          ))}
        </section>
        <section className="message-preview">
          <span className="eyebrow">RECOMMENDED TEMPLATE</span>
          <h2>A short, specific invitation with no sales pitch.</h2>
          <div className="message-paper generated-message"><p>{recommendedMessage}</p></div>
          <div className="message-tip"><span>↗</span><p><strong>Improve your response rate</strong>Add one specific reason why you chose that person.</p></div>
          <button className="primary-button" onClick={() => onCopy(recommendedContact)}>Copy message for {recommendedContact.name.split(" ")[0]} <span>→</span></button>
        </section>
      </div>
    </>
  );
}

export function LearningsView() {
  return (
    <>
      <PageHeader eyebrow="DON'T COLLECT NOTES, FIND SIGNALS" title="What you are learning" subtitle="A working synthesis of 12 conversations." />
      <div className="learning-grid">
        <article className="learning-hero">
          <span className="pill">STRONG SIGNAL</span>
          <strong>8 of 12</strong>
          <h2>Manual follow-up takes more time than the late payment itself.</h2>
          <p>Urgency appears once a business manages more than 30 recurring invoices. Before that point, spreadsheets remain “good enough.”</p>
        </article>
        <article className="hypothesis-card">
          <div className="hypothesis-top"><span>HYPOTHESIS 01</span><b className="validated">TESTING</b></div>
          <h3>SMBs would pay to automate payment reminders.</h3>
          <div className="evidence"><span style={{ width: "68%" }} /></div>
          <p>5 supporting signals · 2 against</p>
        </article>
        <article className="hypothesis-card">
          <div className="hypothesis-top"><span>HYPOTHESIS 02</span><b>OPEN</b></div>
          <h3>The CFO is the purchase decision-maker.</h3>
          <div className="evidence"><span style={{ width: "42%" }} /></div>
          <p>3 supporting signals · 4 to clarify</p>
        </article>
      </div>
      <section className="next-questions">
        <div><span className="eyebrow">NEXT QUESTIONS</span><h2>What you still need to discover</h2></div>
        <ol>
          <li><span>01</span>What does it cost today to resolve a late payment from start to finish?</li>
          <li><span>02</span>What event makes an SMB start looking for a solution?</li>
          <li><span>03</span>Who would use the tool, and who would approve the spend?</li>
        </ol>
      </section>
    </>
  );
}

function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <header className="page-header"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></header>;
}

function ContactCard({ contact, onSelect }: { contact: Contact; onSelect: (contact: Contact) => void }) {
  return (
    <article className="contact-card">
      <div className="card-topline"><div className={`contact-avatar ${contact.color}`}>{contact.initials}</div><span className="fit"><i /> {contact.fit}% fit</span></div>
      <h3>{contact.name}</h3><p className="role">{contact.role} · {contact.company}</p>
      <div className="contact-meta"><span>{contact.sector}</span>{contact.linkedinUrl && <b>LinkedIn</b>}{contact.contactUrl && <b>Public contact</b>}</div>
      <div className="why"><span>{contact.aiGenerated ? "WHY THIS PERSON · AI + PUBLIC WEB" : "WHY NOW · EXAMPLE PROFILE"}</span><p>{contact.reason}</p></div>
      <button className="card-button" onClick={() => onSelect(contact)}>Prepare outreach <span>→</span></button>
    </article>
  );
}

function MissionContextPanel({ mission, onSave }: { mission: Mission; onSave: (context: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [context, setContext] = useState(mission.context);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(context);
    setEditing(false);
  };

  return (
    <div className={`mission-context ${mission.context ? "has-context" : ""}`}>
      <div className="mission-context-heading">
        <div>
          <span className="eyebrow">CONTEXT FOR OUTREACH</span>
          <strong>{mission.context ? "Used to personalize every message in this mission" : "Help each message sound like it comes from you"}</strong>
        </div>
        {!editing && <button type="button" onClick={() => setEditing(true)}>{mission.context ? "Edit context" : "+ Add context"}</button>}
      </div>
      {editing ? (
        <form onSubmit={submit}>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            maxLength={2500}
            rows={5}
            placeholder="Add what you are building, your background or credibility, relevant links, geography, constraints, and anything the recipient should know."
          />
          <div><small>{context.length} / 2500</small><button type="button" onClick={() => { setContext(mission.context); setEditing(false); }}>Cancel</button><button className="primary-button">Save context <span>→</span></button></div>
        </form>
      ) : mission.context ? (
        <p>{mission.context}</p>
      ) : (
        <p className="context-placeholder">For example: your role, why you care about this problem, what you have already built, useful proof, preferred tone, or a relevant link. Adding context never resets the strategy or contact progress.</p>
      )}
    </div>
  );
}

function OutreachDraftCard({ label, meta, text, onCopy }: {
  label: string;
  meta?: string;
  text: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <article className="outreach-draft-card">
      <header><strong>{label}</strong>{meta && <small>{meta}</small>}</header>
      <p>{text}</p>
      <button className="copy-button" onClick={() => onCopy(text, label)}>Copy {label.toLowerCase()} <span>⧉</span></button>
    </article>
  );
}

function ContactDrawer({ contact, isContacted, isGenerating, linkedinConnectionLimit, onClose, onCopy, onGenerate, onContact }: {
  contact: Contact;
  isContacted: boolean;
  isGenerating: boolean;
  linkedinConnectionLimit: 0 | 200 | 300;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
  onGenerate: () => void;
  onContact: () => void;
}) {
  const fallbackMessage = contact.message ?? `Hi ${contact.name.split(" ")[0]}, I'm researching this problem and your experience at ${contact.company} feels especially relevant. Would you be open to a brief conversation?`;
  const outreach = contact.outreach;
  const hasEmail = Boolean(contact.publicEmail && outreach?.emailBody);
  const hasLinkedInConnection = Boolean(contact.linkedinUrl && outreach?.linkedinConnectionMessage && linkedinConnectionLimit > 0);
  const hasLinkedInDirect = Boolean(contact.linkedinUrl && outreach?.linkedinDirectMessage);
  const hasContactForm = Boolean(contact.contactUrl && outreach?.contactFormMessage);
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={`Prepare outreach to ${contact.name}`}>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close" />
      <aside className="drawer">
        <button className="close-button" onClick={onClose} aria-label="Close panel">×</button>
        <div className="drawer-profile"><span className={`contact-avatar large ${contact.color}`}>{contact.initials}</span><div><span className="fit"><i /> {contact.fit}% fit</span><h2>{contact.name}</h2><p>{contact.role} · {contact.company}</p><small>{contact.sector}</small></div></div>
        <div className="contact-routes">
          {contact.linkedinUrl && <a href={contact.linkedinUrl} target="_blank" rel="noreferrer"><span>in</span><div><strong>LinkedIn profile</strong><small>Open verified public profile</small></div><b>↗</b></a>}
          {contact.publicEmail && <a href={`mailto:${contact.publicEmail}`}><span>@</span><div><strong>{contact.publicEmail}</strong><small>Published professional email</small></div><b>↗</b></a>}
          {contact.emailSourceUrl && contact.emailSourceUrl !== contact.sourceUrl && contact.emailSourceUrl !== contact.contactUrl && <a href={contact.emailSourceUrl} target="_blank" rel="noreferrer"><span>✓</span><div><strong>Email verification source</strong><small>Official page publishing this address</small></div><b>↗</b></a>}
          {contact.contactUrl && <a href={contact.contactUrl} target="_blank" rel="noreferrer"><span>✉</span><div><strong>Public contact route</strong><small>{contact.contactMethod || "Official professional contact page"}</small></div><b>↗</b></a>}
          {contact.sourceUrl && contact.sourceUrl !== contact.linkedinUrl && <a href={contact.sourceUrl} target="_blank" rel="noreferrer"><span>✓</span><div><strong>Verification source</strong><small>Confirm role and professional relevance</small></div><b>↗</b></a>}
        </div>
        <section className="drawer-section"><span className="eyebrow">HOW TO REACH THEM RESPONSIBLY</span><p>{contact.warm}</p></section>
        <section className="drawer-section"><span className="eyebrow">CONVERSATION ANGLE</span><p>{contact.angle}</p></section>
        <section className="drawer-section outreach-drafts">
          <div className="outreach-drafts-heading"><div><span className="eyebrow">OUTREACH DRAFTS</span><strong>{outreach ? `Recommended: ${outreach.recommendedChannel}` : "Personalizing by available channel"}</strong></div>{outreach && <button onClick={onGenerate} disabled={isGenerating}>{isGenerating ? "Updating…" : "Regenerate"}</button>}</div>
          {outreach?.channelRationale && <p className="channel-rationale">{outreach.channelRationale}</p>}
          {isGenerating && <div className="outreach-loading"><i className="spinner dark" /><span>Using your mission context, profile and this person’s role…</span></div>}
          {!isGenerating && outreach && (
            <div className="outreach-draft-list">
              {hasEmail && <OutreachDraftCard label="Email" meta={outreach.emailSubject} text={`Subject: ${outreach.emailSubject}\n\n${outreach.emailBody}`} onCopy={onCopy} />}
              {hasLinkedInConnection && <OutreachDraftCard label="LinkedIn connection note" meta={`${outreach.linkedinConnectionMessage.length} / ${linkedinConnectionLimit} characters`} text={outreach.linkedinConnectionMessage} onCopy={onCopy} />}
              {hasLinkedInDirect && <OutreachDraftCard label="LinkedIn direct message" meta="For an existing connection or message access" text={outreach.linkedinDirectMessage} onCopy={onCopy} />}
              {hasContactForm && <OutreachDraftCard label="Public contact form" meta={contact.contactMethod} text={outreach.contactFormMessage} onCopy={onCopy} />}
              {!hasEmail && !hasLinkedInConnection && !hasLinkedInDirect && !hasContactForm && <p className="no-channel-draft">No verified direct route is available yet. Use the public source to find the appropriate professional channel before sending anything.</p>}
            </div>
          )}
          {!isGenerating && !outreach && <><div className="draft-message generated-message"><p>{fallbackMessage}</p></div><button className="copy-button" onClick={() => onCopy(fallbackMessage, "Message")}>Copy current message <span>⧉</span></button><button className="secondary-outreach-button" onClick={onGenerate}>Generate channel-specific drafts</button></>}
        </section>
        <button className={`primary-button drawer-cta ${isContacted ? "completed" : ""}`} onClick={onContact} disabled={isContacted}>{isContacted ? "Already in follow-up" : "Mark as contacted"}<span>{isContacted ? "✓" : "→"}</span></button>
      </aside>
    </div>
  );
}

function OutreachSettingsModal({ profile, onClose, onSave }: {
  profile: UserOutreachProfile;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="outreach-settings-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <form className="mission-modal settings-modal" onSubmit={onSave}>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close modal">×</button>
        <span className="step-label">OUTREACH SETTINGS</span>
        <h2 id="outreach-settings-title">Give each message a credible sender.</h2>
        <p className="modal-intro">These details apply across missions. Mission-specific details belong in each mission’s context box.</p>
        <div className="settings-grid">
          <label>Your name<input name="name" maxLength={120} defaultValue={profile.name} placeholder="Martí Massó" /></label>
          <label>Your role<input name="role" maxLength={160} defaultValue={profile.role} placeholder="Founder, researcher, student…" /></label>
          <label>Organization<input name="organization" maxLength={160} defaultValue={profile.organization} placeholder="Company, university or independent" /></label>
          <label>Message language<input name="preferredLanguage" maxLength={80} defaultValue={profile.preferredLanguage} placeholder="English, Spanish, match recipient…" /></label>
        </div>
        <label>Your background and credibility<textarea name="background" maxLength={1600} defaultValue={profile.background} rows={4} placeholder="Relevant experience, projects, domain knowledge, shared communities or links that can truthfully strengthen an introduction." /></label>
        <div className="settings-grid">
          <label>LinkedIn connection note allowance<select name="linkedinConnectionLimit" defaultValue={profile.linkedinConnectionLimit}><option value="0">No connection note</option><option value="200">Up to 200 characters</option><option value="300">Up to 300 characters</option></select></label>
          <label>Preferred LinkedIn approach<select name="linkedinWorkflow" defaultValue={profile.linkedinWorkflow}><option value="connect_first">Connect first, then follow up</option><option value="direct_when_available">Direct message when available</option><option value="either">Recommend the best option</option></select></label>
        </div>
        <p className="mission-edit-note">Choose the allowance your current LinkedIn account actually shows; LinkedIn can change limits independently of 100 Calls.</p>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Save settings <span>→</span></button></div>
      </form>
    </div>
  );
}

function MissionModal({ mode, mission, onClose, onSave }: {
  mode: MissionModalMode;
  mission: Mission | null;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const editing = mode === "edit";
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="mission-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <form className="mission-modal" onSubmit={onSave}>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close modal">×</button>
        <span className="step-label">{editing ? "EDIT MISSION" : "NEW MISSION · STEP 1 OF 1"}</span>
        <h2 id="mission-title">{editing ? "Refine this mission without losing the rest." : "Turn your idea into a question the market can answer."}</h2>
        <label>What do you want to validate?<textarea name="idea" required maxLength={600} defaultValue={mission?.title ?? ""} rows={3} /></label>
        <label>Which profiles do you need to speak with?<input name="audience" required maxLength={400} defaultValue={mission?.audience ?? ""} /></label>
        <label>What do you need to learn?<input name="question" required maxLength={400} defaultValue={mission?.question ?? ""} /></label>
        {editing && <p className="mission-edit-note">Your contacts, follow-up progress and learnings will be preserved. The strategy will adapt to the revised objective.</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">{editing ? "Save changes" : "Create mission"} <span>→</span></button></div>
      </form>
    </div>
  );
}

function AuthLoading() {
  return (
    <main className="auth-loading" aria-live="polite">
      <div className="brand auth-brand"><span className="brand-mark">100</span><span>CALLS</span></div>
      <i className="spinner dark" />
      <p>Loading your workspace…</p>
    </main>
  );
}

function AuthScreen({ initialMode, onRecoveryComplete }: {
  initialMode: AuthMode;
  onRecoveryComplete: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("auth_error") === "google"
      ? "Google sign-in could not be completed. Please try again."
      : ""
  );
  const [message, setMessage] = useState("");

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }

      if (mode === "signup") {
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Check your inbox to confirm your email, then come back to sign in.");
        }
      }

      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?mode=reset`,
        });
        if (resetError) throw resetError;
        setMessage("If an account exists for that email, a secure reset link is on its way.");
      }

      if (mode === "reset") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        onRecoveryComplete();
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    setError("");
    setMessage("");
    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (googleError) throw googleError;
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Google sign-in could not be started.");
      setGoogleLoading(false);
    }
  };

  const content = {
    signin: { eyebrow: "WELCOME BACK", title: "Keep the conversations moving.", action: "Sign in" },
    signup: { eyebrow: "START YOUR FIRST MISSION", title: "Turn uncertainty into 100 useful conversations.", action: "Create account" },
    forgot: { eyebrow: "PASSWORD RECOVERY", title: "We'll help you get back in.", action: "Send reset link" },
    reset: { eyebrow: "SECURE YOUR ACCOUNT", title: "Choose a new password.", action: "Update password" },
  }[mode];

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand auth-brand"><span className="brand-mark">100</span><span>CALLS</span></div>
        <div className="auth-story-copy">
          <span className="pill">FROM IDEA TO EVIDENCE</span>
          <h1>Talk to the people who truly matter.</h1>
          <p>Find the right people, ask sharper questions, and build your company on evidence instead of assumptions.</p>
        </div>
        <div className="auth-proof">
          <div><strong>100</strong><span>meaningful conversations</span></div>
          <div><strong>1</strong><span>validated direction</span></div>
        </div>
        <div className="auth-network" aria-hidden="true"><i /><i /><i /><span>?</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow">{content.eyebrow}</span>
          <h2>{content.title}</h2>
          <p className="auth-subtitle">
            {mode === "signin" && "Enter your details to open your validation workspace."}
            {mode === "signup" && "Create a private workspace for your contacts, messages, and learnings."}
            {mode === "forgot" && "Enter your email and we'll send you a secure password reset link."}
            {mode === "reset" && "Your new password must contain at least 8 characters."}
          </p>

          {(mode === "signin" || mode === "signup") && (
            <>
              <button className="google-auth-button" type="button" onClick={signInWithGoogle} disabled={googleLoading || loading}>
                <GoogleIcon />
                {googleLoading ? "Opening Google…" : "Continue with Google"}
              </button>
              <div className="auth-divider"><span>or continue with email</span></div>
            </>
          )}

          <form className="auth-form" onSubmit={submitAuth}>
            {mode !== "reset" && (
              <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
            )}
            {(mode === "signin" || mode === "signup" || mode === "reset") && (
              <label>
                <span>{mode === "reset" ? "New password" : "Password"}{mode === "signin" && <button type="button" onClick={() => changeMode("forgot")}>Forgot password?</button>}</span>
                <input type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
              </label>
            )}
            {(mode === "signup" || mode === "reset") && (
              <label>Confirm password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" /></label>
            )}

            {error && <div className="auth-alert error" role="alert"><span>!</span>{error}</div>}
            {message && <div className="auth-alert success" role="status"><span>✓</span>{message}</div>}

            <button className="primary-button auth-submit" disabled={loading || googleLoading}>
              {loading ? <><i className="spinner" /> Please wait</> : <>{content.action}<span>→</span></>}
            </button>
          </form>

          {mode === "signin" && <p className="auth-switch">New to 100 Calls? <button onClick={() => changeMode("signup")}>Create an account</button></p>}
          {mode === "signup" && <p className="auth-switch">Already have an account? <button onClick={() => changeMode("signin")}>Sign in</button></p>}
          {mode === "forgot" && <p className="auth-switch"><button onClick={() => changeMode("signin")}>← Back to sign in</button></p>}
          {mode === "reset" && <p className="auth-switch"><button onClick={onRecoveryComplete}>Cancel</button></p>}
        </div>
        <p className="auth-legal">By continuing, you agree to use 100 Calls responsibly and respect the privacy of every person you contact.</p>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.37l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.92A6.03 6.03 0 0 1 6.07 12c0-.67.11-1.32.32-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.54l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  );
}
