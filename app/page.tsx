"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { restorePersistedSession, supabase } from "@/lib/supabase";

type AuthMode = "signin" | "signup" | "forgot" | "reset";
type MissionModalMode = "new" | "edit";
type Mission = {
  id: string;
  title: string;
  audience: string;
  question: string;
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
  }>;
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

const MISSION_METADATA_KEY = "one_hundred_calls_workspace";
const starterMission: Mission = {
  id: "late-payments-smbs",
  title: "Validate a tool that reduces late payments for SMBs",
  audience: "finance leaders, B2B founders, and collections experts",
  question: "the problem, urgency, and willingness to pay",
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

function readStoredMission(value: unknown): Mission | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const mission = {
    id: cleanMissionField(candidate.id, 100),
    title: cleanMissionField(candidate.title, 600),
    audience: cleanMissionField(candidate.audience, 400),
    question: cleanMissionField(candidate.question, 400),
  };
  return Object.values(mission).every(Boolean) ? mission : null;
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
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const missionSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
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

  useEffect(() => {
    let active = true;

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) return;

      const storedWorkspace = readStoredMissionWorkspace(nextSession.user.user_metadata as Record<string, unknown> | undefined);
      const nextMissions = storedWorkspace?.missions ?? [starterMission];
      const nextActiveMissionId = storedWorkspace?.activeMissionId ?? starterMission.id;

      setMissions(nextMissions);
      setActiveMissionId(nextActiveMissionId);
      setMissionResearch((current) => {
        const nextResearch: Record<string, MissionResearch> = {};
        nextMissions.forEach((mission) => {
          nextResearch[mission.id] = current[mission.id]
            ?? emptyResearch();
        });
        return nextResearch;
      });
      setSelected(null);
      setFilter("All");
      setQuery("");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "SIGNED_OUT") {
        applySession(nextSession);
      } else {
        setSession(nextSession);
      }
      setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (event === "SIGNED_OUT") setShowAccount(false);
    });

    restorePersistedSession()
      .then((persistedSession) => {
        applySession(persistedSession);
      })
      .catch(() => {
        applySession(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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

  const buildPlan = async (targetMission: Mission) => {
    const targetMissionId = targetMission.id;
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
        body: JSON.stringify({ mission: targetMission, stage: "plan" }),
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
      updateMissionResearch(mission.id, () => emptyResearch());
      persistMissionWorkspace(nextMissions, mission.id);
      notify("Mission updated · building a new plan");
      void buildPlan(updatedMission);
    } else {
      const newMission: Mission = {
        id: crypto.randomUUID(),
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

  const copyMessage = async (contact: Contact) => {
    const message = contact.message ?? `Hi ${contact.name.split(" ")[0]}, I'm exploring ${mission.title.toLowerCase()}. Your experience at ${contact.company} feels especially relevant. I'm not trying to sell you anything—would you be open to a 20-minute conversation so I can test what I'm learning?`;
    try { await navigator.clipboard.writeText(message); } catch { /* Clipboard can be unavailable in previews. */ }
    notify("Message copied");
  };

  const finishRecovery = () => {
    setRecoveryMode(false);
    window.history.replaceState({}, "", window.location.pathname);
    notify("Password updated successfully");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
        <div className="account-menu-wrap" ref={accountMenuRef}>
          <button className="account-button" onClick={() => setShowAccount((open) => !open)} aria-expanded={showAccount} aria-label="Open account menu">
            <span>{accountInitials}</span><small>{accountEmail}</small><b>⌄</b>
          </button>
          {showAccount && (
            <div className="account-menu">
              <span className="eyebrow">SIGNED IN AS</span>
              <strong>{accountEmail}</strong>
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
          onToggleStrategy={() => setStrategyOpen((open) => !open)}
          onToggleCandidates={() => setCandidateListOpen((open) => !open)}
          onAddNote={setNoteSector}
          onFind={() => findContacts("")}
          onExpand={() => setExpansionOpen(true)}
          onQuery={setQuery}
          onFilter={setFilter}
          onSelect={setSelected}
        />
      </section>

      {selected && (
        <ContactDrawer
          contact={selected}
          isContacted={contacted.includes(selected.id)}
          onClose={() => setSelected(null)}
          onCopy={() => copyMessage(selected)}
          onContact={() => markContacted(selected.id)}
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
  onToggleStrategy,
  onToggleCandidates,
  onAddNote,
  onFind,
  onExpand,
  onQuery,
  onFilter,
  onSelect,
}: {
  mission: Mission;
  plan: ActionPlan | null;
  contacts: Contact[];
  totalContacts: number;
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
  onToggleStrategy: () => void;
  onToggleCandidates: () => void;
  onAddNote: (sector: string) => void;
  onFind: () => void;
  onExpand: () => void;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (contact: Contact) => void;
}) {
  return (
    <div className="mission-flow">
      <section className="objective-panel">
        <div className="flow-number">01</div>
        <div className="objective-copy">
          <span className="eyebrow">OBJECTIVE</span>
          <h1>{mission.title}</h1>
          <p><strong>People:</strong> {mission.audience}</p>
          <p><strong>What to learn:</strong> {mission.question}</p>
        </div>
        <button className="edit-objective" onClick={onEditMission}><span>✎</span>Edit objective</button>
      </section>

      {aiError && <div className="workspace-error" role="alert"><span>!</span><p>{aiError}</p></div>}

      {isPlanning && (
        <section className="flow-loading" aria-live="polite">
          <i className="spinner dark" />
          <div><strong>Building the contact strategy</strong><p>Mapping sectors, roles, learning value and interview order.</p></div>
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

function CandidatePool({ contacts, total, contacted, isOpen, isDiscovering, discovered, query, filter, onToggle, onFind, onExpand, onQuery, onFilter, onSelect }: {
  contacts: Contact[];
  total: number;
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
                        <span className="candidate-links">{contact.linkedinUrl && <i>in</i>}{contact.contactUrl && <b>Contact</b>}</span>
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

function ContactDrawer({ contact, isContacted, onClose, onCopy, onContact }: {
  contact: Contact;
  isContacted: boolean;
  onClose: () => void;
  onCopy: () => void;
  onContact: () => void;
}) {
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={`Prepare outreach to ${contact.name}`}>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close" />
      <aside className="drawer">
        <button className="close-button" onClick={onClose} aria-label="Close panel">×</button>
        <div className="drawer-profile"><span className={`contact-avatar large ${contact.color}`}>{contact.initials}</span><div><span className="fit"><i /> {contact.fit}% fit</span><h2>{contact.name}</h2><p>{contact.role} · {contact.company}</p><small>{contact.sector}</small></div></div>
        <div className="contact-routes">
          {contact.linkedinUrl && <a href={contact.linkedinUrl} target="_blank" rel="noreferrer"><span>in</span><div><strong>LinkedIn profile</strong><small>Open verified public profile</small></div><b>↗</b></a>}
          {contact.contactUrl && <a href={contact.contactUrl} target="_blank" rel="noreferrer"><span>✉</span><div><strong>Public contact route</strong><small>{contact.contactMethod || "Official professional contact page"}</small></div><b>↗</b></a>}
          {contact.sourceUrl && contact.sourceUrl !== contact.linkedinUrl && <a href={contact.sourceUrl} target="_blank" rel="noreferrer"><span>✓</span><div><strong>Verification source</strong><small>Confirm role and professional relevance</small></div><b>↗</b></a>}
        </div>
        <section className="drawer-section"><span className="eyebrow">HOW TO REACH THEM RESPONSIBLY</span><p>{contact.warm}</p></section>
        <section className="drawer-section"><span className="eyebrow">CONVERSATION ANGLE</span><p>{contact.angle}</p></section>
        <section className="drawer-section"><span className="eyebrow">SUGGESTED MESSAGE</span><div className="draft-message generated-message"><p>{contact.message ?? `Hi ${contact.name.split(" ")[0]}, I'm exploring a way to help SMBs reduce late payments. Your experience at ${contact.company} feels especially relevant. I'm not trying to sell you anything—would you be open to a 20-minute conversation so I can test what I'm learning?`}</p></div><button className="copy-button" onClick={onCopy}>Copy message <span>⧉</span></button></section>
        <button className={`primary-button drawer-cta ${isContacted ? "completed" : ""}`} onClick={onContact} disabled={isContacted}>{isContacted ? "Already in follow-up" : "Mark as contacted"}<span>{isContacted ? "✓" : "→"}</span></button>
      </aside>
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
        {editing && <p className="mission-edit-note">Changing the focus clears this mission&apos;s current plan and contacts, then automatically builds a new strategic plan.</p>}
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
