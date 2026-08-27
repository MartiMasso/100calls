"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { restorePersistedSession, supabase } from "@/lib/supabase";
import {
  addPlanNote,
  createMission,
  deletePlanNote,
  fetchContacts,
  fetchLatestPlan,
  fetchMessages,
  fetchMissions,
  fetchPlanNotes,
  fetchPlanVersions,
  insertContacts,
  logMessage,
  markNotesApplied,
  migrateLegacyWorkspace,
  savePlanVersion,
  updateContactStatus,
  updateMission,
} from "@/lib/workspace";
import type {
  ActionPlan,
  Contact,
  ContactStatus,
  Message,
  Mission,
  PlanNote,
  PlanNoteKind,
  PlanSegment,
  PlanVersionSummary,
  ResearchedProfile,
} from "@/lib/workspace";

type View = "strategy" | "contacts" | "messages" | "learnings";
type AuthMode = "signin" | "signup" | "forgot" | "reset";
type Busy = "" | "plan" | "revise" | "contacts";
type MissionFields = { title: string; audience: string; question: string };

type PlanResponse = {
  plan: { segments: PlanSegment[]; revisionSummary: string };
  model: string;
};

type ContactResearchResponse = {
  profiles: ResearchedProfile[];
  model: string;
};

type Workspace = {
  plan: ActionPlan | null;
  versions: PlanVersionSummary[];
  notes: PlanNote[];
  contacts: Contact[];
  messages: Message[];
};

const emptyWorkspace: Workspace = { plan: null, versions: [], notes: [], contacts: [], messages: [] };

const tabs: { id: View; label: string }[] = [
  { id: "strategy", label: "Plan" },
  { id: "contacts", label: "Contacts" },
  { id: "messages", label: "Messages" },
  { id: "learnings", label: "Learnings" },
];

const noteKinds: { id: PlanNoteKind; label: string }[] = [
  { id: "evidence", label: "Supports" },
  { id: "counter", label: "Contradicts" },
  { id: "question", label: "Question" },
  { id: "decision", label: "Decision" },
];

const activeStatuses: ContactStatus[] = ["contacted", "replied", "scheduled", "done"];

function errorText(error: unknown, fallback: string): string {
  const message = error instanceof Error && error.message ? error.message : fallback;
  // The most likely first-run failure is a database that has not been created yet.
  return /does not exist|schema cache|relation .* missing/i.test(message)
    ? "Your workspace tables are missing. Run supabase/schema.sql in the Supabase SQL editor, then reload."
    : message;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "reset"
  );
  const [showAccount, setShowAccount] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>("strategy");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [activeMissionId, setActiveMissionId] = useState("");
  const [loaded, setLoaded] = useState<{ missionId: string; data: Workspace }>({ missionId: "", data: emptyWorkspace });
  const [busy, setBusy] = useState<Busy>("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [expandOpen, setExpandOpen] = useState(false);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "INITIAL_SESSION") return;
      setSession(nextSession);
      setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (event === "SIGNED_OUT") {
        setShowAccount(false);
        setMissions([]);
        setActiveMissionId("");
        setLoaded({ missionId: "", data: emptyWorkspace });
      }
    });

    restorePersistedSession()
      .then((persistedSession) => { if (active) setSession(persistedSession); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { if (active) setAuthLoading(false); });

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

  const userId = session?.user.id ?? "";

  // Load the mission list once per signed-in user, migrating any workspace
  // that predates the database.
  useEffect(() => {
    if (!userId) return;
    let active = true;

    (async () => {
      try {
        const stored = await fetchMissions();
        const list = stored.length > 0
          ? stored
          : await migrateLegacyWorkspace(session?.user.user_metadata as Record<string, unknown> | undefined);
        if (!active) return;
        setMissions(list);
        setActiveMissionId(list[0]?.id ?? "");
        setError("");
      } catch (loadError) {
        if (active) setError(errorText(loadError, "Your workspace could not be loaded."));
      }
    })();

    return () => { active = false; };
  }, [session?.user.user_metadata, userId]);

  // Load everything belonging to the active mission.
  useEffect(() => {
    if (!activeMissionId) return;
    let active = true;

    (async () => {
      try {
        const [plan, versions, notes, contacts, messages] = await Promise.all([
          fetchLatestPlan(activeMissionId),
          fetchPlanVersions(activeMissionId),
          fetchPlanNotes(activeMissionId),
          fetchContacts(activeMissionId),
          fetchMessages(activeMissionId),
        ]);
        if (!active) return;
        setLoaded({ missionId: activeMissionId, data: { plan, versions, notes, contacts, messages } });
        setError("");
      } catch (loadError) {
        if (!active) return;
        setLoaded({ missionId: activeMissionId, data: emptyWorkspace });
        setError(errorText(loadError, "This mission could not be loaded."));
      }
    })();

    return () => { active = false; };
  }, [activeMissionId]);

  const updateWorkspace = useCallback((update: (current: Workspace) => Workspace) => {
    setLoaded((current) => ({ ...current, data: update(current.data) }));
  }, []);

  const mission = useMemo(
    () => missions.find((item) => item.id === activeMissionId) ?? null,
    [activeMissionId, missions],
  );
  const workspace = loaded.missionId === activeMissionId ? loaded.data : emptyWorkspace;
  const loadingWorkspace = Boolean(activeMissionId) && loaded.missionId !== activeMissionId;
  const { plan, versions, notes, contacts, messages } = workspace;
  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;
  const pendingNotes = useMemo(() => notes.filter((note) => !note.appliedToPlanId), [notes]);
  const filteredContacts = useMemo(() => contacts.filter((contact) => {
    const matchesType = filter === "All" || contact.type === filter;
    const haystack = `${contact.name} ${contact.role} ${contact.company} ${contact.sector}`.toLowerCase();
    return matchesType && haystack.includes(query.toLowerCase());
  }), [contacts, filter, query]);

  const selectMission = (missionId: string) => {
    setActiveMissionId(missionId);
    setView("strategy");
    setCreating(false);
    setEditing(false);
    setSelectedId("");
    setFilter("All");
    setQuery("");
  };

  /** Asks the model for a plan and stores it as a new version, without touching view state. */
  const requestPlan = async (targetMission: Mission, mode: "plan" | "revise"): Promise<ActionPlan> => {
    const progress = mode === "revise"
      ? plan?.segments.map((segment) => {
        const segmentContacts = contacts.filter((contact) => contact.sector === segment.title);
        return {
          segment: segment.title,
          found: segmentContacts.length,
          contacted: segmentContacts.filter((contact) => activeStatuses.includes(contact.status)).length,
          replied: segmentContacts.filter((contact) => contact.status === "replied" || contact.status === "done").length,
        };
      })
      : undefined;

    const response = await fetch("/api/ai/research", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session?.access_token ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mission: { title: targetMission.title, audience: targetMission.audience, question: targetMission.question },
        stage: mode,
        plan: mode === "revise" ? plan?.segments : undefined,
        notes: mode === "revise"
          ? pendingNotes.map((note) => ({ segment: note.segment || "mission", kind: note.kind, body: note.body }))
          : undefined,
        progress,
      }),
    });
    const result = await response.json() as PlanResponse | { error?: string };
    if (!response.ok || !("plan" in result)) {
      throw new Error("error" in result && result.error ? result.error : "The plan could not be generated.");
    }
    return savePlanVersion(targetMission.id, { ...result.plan, model: result.model });
  };

  const createAndPlan = async (fields: MissionFields) => {
    setBusy("plan");
    setError("");
    try {
      const created = await createMission(fields);
      await requestPlan(created, "plan");
      setMissions((current) => [created, ...current]);
      setCreating(false);
      setEditing(false);
      setActiveMissionId(created.id);
      notify("Plan ready");
    } catch (planError) {
      setError(errorText(planError, "The plan could not be generated."));
    } finally {
      setBusy("");
    }
  };

  const saveAndPlan = async (fields: MissionFields) => {
    if (!mission) return;
    setBusy("plan");
    setError("");
    try {
      const updated = await updateMission(mission.id, fields);
      setMissions((current) => current.map((item) => item.id === updated.id ? updated : item));
      const saved = await requestPlan(updated, "plan");
      const nextVersions = await fetchPlanVersions(updated.id);
      updateWorkspace((current) => ({ ...current, plan: saved, versions: nextVersions }));
      setEditing(false);
      notify("Plan ready");
    } catch (planError) {
      setError(errorText(planError, "The plan could not be generated."));
    } finally {
      setBusy("");
    }
  };

  const revisePlan = async () => {
    if (!mission) return;
    setBusy("revise");
    setError("");
    try {
      const saved = await requestPlan(mission, "revise");
      if (pendingNotes.length > 0) await markNotesApplied(pendingNotes.map((note) => note.id), saved.id);
      const [nextVersions, nextNotes] = await Promise.all([
        fetchPlanVersions(mission.id),
        fetchPlanNotes(mission.id),
      ]);
      updateWorkspace((current) => ({ ...current, plan: saved, versions: nextVersions, notes: nextNotes }));
      notify(`Plan updated to v${saved.version}`);
    } catch (planError) {
      setError(errorText(planError, "The plan could not be updated."));
    } finally {
      setBusy("");
    }
  };

  const findPeople = async (guidance = "") => {
    if (!mission || !plan) return;
    setBusy("contacts");
    setError("");

    try {
      const response = await fetch("/api/ai/research", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session?.access_token ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mission: { title: mission.title, audience: mission.audience, question: mission.question },
          stage: "contacts",
          plan: plan.segments,
          guidance,
          exclude: contacts.map((contact) => `${contact.name} · ${contact.company}`),
        }),
      });
      const result = await response.json() as ContactResearchResponse | { error?: string };
      if (!response.ok || !("profiles" in result)) {
        throw new Error("error" in result && result.error ? result.error : "The contact search could not be completed.");
      }

      const known = new Set(contacts.map((contact) => `${contact.name}|${contact.company}`.toLowerCase()));
      const fresh = result.profiles.filter((profile) => !known.has(`${profile.name}|${profile.company}`.toLowerCase()));
      if (fresh.length === 0) {
        notify("No new people in this batch — try adding guidance");
        return;
      }

      const wave = contacts.reduce((highest, contact) => Math.max(highest, contact.wave), 0) + 1;
      const inserted = await insertContacts(mission.id, fresh, wave);
      updateWorkspace((current) => ({ ...current, contacts: [...current.contacts, ...inserted] }));
      setView("contacts");
      notify(`${inserted.length} people added`);
    } catch (researchError) {
      setError(errorText(researchError, "The contact search could not be completed."));
    } finally {
      setBusy("");
    }
  };

  const submitNote = async (segment: string, kind: PlanNoteKind, body: string) => {
    if (!mission || !body.trim()) return;
    try {
      const note = await addPlanNote({
        missionId: mission.id,
        planId: plan?.id ?? null,
        segment,
        kind,
        body: body.trim().slice(0, 1200),
      });
      updateWorkspace((current) => ({ ...current, notes: [note, ...current.notes] }));
    } catch (noteError) {
      setError(errorText(noteError, "The note could not be saved."));
    }
  };

  const removeNote = async (id: string) => {
    try {
      await deletePlanNote(id);
      updateWorkspace((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== id) }));
    } catch (noteError) {
      setError(errorText(noteError, "The note could not be removed."));
    }
  };

  const changeStatus = async (contact: Contact, status: ContactStatus) => {
    try {
      await updateContactStatus(contact.id, status);
      let logged: Message | null = null;
      if (status === "contacted" && !messages.some((item) => item.contactId === contact.id)) {
        logged = await logMessage({
          missionId: contact.missionId,
          contactId: contact.id,
          direction: "outbound",
          channel: contact.linkedinUrl ? "linkedin" : "email",
          subject: contact.name,
          body: contact.message,
        });
      }
      updateWorkspace((current) => ({
        ...current,
        contacts: current.contacts.map((item) => item.id === contact.id ? { ...item, status } : item),
        messages: logged ? [...current.messages, logged] : current.messages,
      }));
    } catch (statusError) {
      setError(errorText(statusError, "The contact could not be updated."));
    }
  };

  const copyMessage = async (contact: Contact) => {
    try { await navigator.clipboard.writeText(contact.message); } catch { /* Clipboard can be unavailable in previews. */ }
    notify("Message copied");
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
        onRecoveryComplete={() => {
          setRecoveryMode(false);
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }

  const accountEmail = session.user.email ?? "Your account";
  const sentCount = messages.filter((item) => item.direction === "outbound").length;
  const replyCount = contacts.filter((contact) => contact.status === "replied" || contact.status === "done").length;
  const showForm = !mission || creating || (view === "strategy" && (!plan || editing));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("strategy")} aria-label="Go to plan">100 CALLS</button>

        <div className="mission-picker">
          <select
            aria-label="Select mission"
            value={activeMissionId}
            onChange={(event) => selectMission(event.target.value)}
            disabled={missions.length === 0}
          >
            {missions.length === 0 && <option value="">No missions yet</option>}
            {missions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <button className="link-button" onClick={() => { setCreating(true); setView("strategy"); }}>New mission</button>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {tabs.map((tab) => (
            <button className={`nav-item ${view === tab.id ? "active" : ""}`} key={tab.id} onClick={() => { setView(tab.id); setCreating(false); }}>
              {tab.label}
              {tab.id === "contacts" && contacts.length > 0 && <b>{contacts.length}</b>}
              {tab.id === "messages" && sentCount > 0 && <b>{sentCount}</b>}
              {tab.id === "strategy" && pendingNotes.length > 0 && <b>{pendingNotes.length}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <span>{sentCount} sent · {replyCount} replies</span>
        </div>
      </aside>

      <div className="mobile-header">
        <button className="brand" onClick={() => setView("strategy")}>100 CALLS</button>
        <div className="mobile-header-controls">
          <select aria-label="Select mission" value={activeMissionId} onChange={(event) => selectMission(event.target.value)}>
            {missions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <select aria-label="Change section" value={view} onChange={(event) => setView(event.target.value as View)}>
            {tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
          </select>
        </div>
      </div>

      <section className="workspace">
        <div className="account-menu-wrap" ref={accountMenuRef}>
          <button className="account-button" onClick={() => setShowAccount((open) => !open)} aria-expanded={showAccount} aria-label="Open account menu">
            <span>{accountEmail.slice(0, 2).toUpperCase()}</span>
          </button>
          {showAccount && (
            <div className="account-menu">
              <strong>{accountEmail}</strong>
              <button onClick={() => { setShowAccount(false); setRecoveryMode(true); }}>Change password</button>
              <button onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>

        {error && <div className="workspace-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}

        {loadingWorkspace ? (
          <p className="loading-line" aria-live="polite">Loading…</p>
        ) : showForm ? (
          <MissionForm
            key={creating || !mission ? "new" : mission.id}
            mission={creating ? null : mission}
            busy={busy === "plan"}
            onSubmit={creating || !mission ? createAndPlan : saveAndPlan}
            onCancel={mission && plan ? () => { setCreating(false); setEditing(false); } : undefined}
          />
        ) : mission ? (
          <>
            {view === "strategy" && plan && (
              <PlanView
                mission={mission}
                plan={plan}
                versions={versions}
                notes={notes}
                pendingNotes={pendingNotes.length}
                contacts={contacts}
                busy={busy}
                onEdit={() => setEditing(true)}
                onRevise={revisePlan}
                onFind={() => findPeople()}
                onOpenContacts={() => setView("contacts")}
                onAddNote={submitNote}
                onRemoveNote={removeNote}
              />
            )}

            {view === "contacts" && (
              <ContactsView
                contacts={filteredContacts}
                total={contacts.length}
                sent={sentCount}
                replies={replyCount}
                query={query}
                filter={filter}
                busy={busy}
                onQuery={setQuery}
                onFilter={setFilter}
                onSelect={setSelectedId}
                onExpand={() => setExpandOpen(true)}
                onBack={() => setView("strategy")}
              />
            )}

            {view === "messages" && (
              <MessagesView
                contacts={contacts}
                messages={messages}
                onSelect={setSelectedId}
                onCopy={copyMessage}
                onStatus={changeStatus}
              />
            )}

            {view === "learnings" && <LearningsView notes={notes} contacts={contacts} />}
          </>
        ) : null}
      </section>

      {selected && (
        <ContactDrawer
          contact={selected}
          history={messages.filter((item) => item.contactId === selected.id)}
          onClose={() => setSelectedId("")}
          onCopy={() => copyMessage(selected)}
          onStatus={(status) => changeStatus(selected, status)}
        />
      )}

      {expandOpen && (
        <ExpandModal
          onClose={() => setExpandOpen(false)}
          onExpand={(guidance) => { setExpandOpen(false); void findPeople(guidance); }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function MissionForm({ mission, busy, onSubmit, onCancel }: {
  mission: Mission | null;
  busy: boolean;
  onSubmit: (fields: MissionFields) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(mission?.title ?? "");
  const [audience, setAudience] = useState(mission?.audience ?? "");
  const [question, setQuestion] = useState(mission?.question ?? "");
  const ready = Boolean(title.trim() && audience.trim() && question.trim());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || busy) return;
    onSubmit({ title: title.trim().slice(0, 600), audience: audience.trim().slice(0, 400), question: question.trim().slice(0, 400) });
  };

  return (
    <form className="mission-form" onSubmit={submit}>
      <h1>What are you looking for?</h1>
      <label>
        What you want to validate
        <textarea value={title} onChange={(event) => setTitle(event.target.value)} rows={2} maxLength={600} />
      </label>
      <label>
        Who can tell you
        <input value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={400} />
      </label>
      <label>
        What you need to learn
        <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={400} />
      </label>
      <div className="form-actions">
        {ready && (
          <button className="primary-button" disabled={busy}>
            {busy ? "Generating…" : mission ? "Regenerate plan" : "Generate plan"}
          </button>
        )}
        {onCancel && <button type="button" className="link-button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function PlanView({
  mission, plan, versions, notes, pendingNotes, contacts, busy,
  onEdit, onRevise, onFind, onOpenContacts, onAddNote, onRemoveNote,
}: {
  mission: Mission;
  plan: ActionPlan;
  versions: PlanVersionSummary[];
  notes: PlanNote[];
  pendingNotes: number;
  contacts: Contact[];
  busy: Busy;
  onEdit: () => void;
  onRevise: () => void;
  onFind: () => void;
  onOpenContacts: () => void;
  onAddNote: (segment: string, kind: PlanNoteKind, body: string) => void;
  onRemoveNote: (id: string) => void;
}) {
  const working = busy !== "";

  return (
    <>
      <header className="plan-header">
        <h1>{mission.title}</h1>
        <button className="link-button" onClick={onEdit}>Edit</button>
      </header>

      <div className="plan-bar">
        <span>v{plan.version} · {versions.length} versions · {contacts.length} people</span>
        <div>
          <button className="link-button" onClick={onRevise} disabled={working}>
            {busy === "revise" ? "Updating…" : pendingNotes > 0 ? `Update plan (${pendingNotes})` : "Update plan"}
          </button>
          <button
            className="primary-button compact"
            onClick={contacts.length > 0 ? onOpenContacts : onFind}
            disabled={working}
          >
            {busy === "contacts" ? "Searching…" : contacts.length > 0 ? "Open contacts" : "Find people"}
          </button>
        </div>
      </div>

      {plan.revisionSummary && <p className="revision">{plan.revisionSummary}</p>}

      <ol className="segments">
        {plan.segments.map((segment, index) => (
          <li className={`segment change-${segment.change}`} key={segment.title}>
            <div className="segment-head">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{segment.title}</h2>
              <b>{contacts.filter((contact) => contact.sector === segment.title).length}/{segment.targetCount}</b>
            </div>
            <ul className="subsegments">
              {segment.subsegments.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {segment.change !== "unchanged" && segment.changeNote && <p className="change-note">{segment.changeNote}</p>}
            <NoteThread
              segment={segment.title}
              notes={notes.filter((note) => note.segment === segment.title)}
              onAddNote={onAddNote}
              onRemoveNote={onRemoveNote}
            />
          </li>
        ))}
      </ol>

      <NoteThread
        segment=""
        label="Mission notes"
        notes={notes.filter((note) => !note.segment)}
        onAddNote={onAddNote}
        onRemoveNote={onRemoveNote}
      />
    </>
  );
}

function NoteThread({ segment, label, notes, onAddNote, onRemoveNote }: {
  segment: string;
  label?: string;
  notes: PlanNote[];
  onAddNote: (segment: string, kind: PlanNoteKind, body: string) => void;
  onRemoveNote: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlanNoteKind>("evidence");
  const [body, setBody] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAddNote(segment, kind, body);
    setBody("");
    setOpen(false);
  };

  return (
    <div className="notes">
      {notes.length > 0 && (
        <ul className="note-list">
          {notes.map((note) => (
            <li key={note.id} className={`note note-${note.kind}${note.appliedToPlanId ? "" : " pending"}`}>
              <b>{noteKinds.find((item) => item.id === note.kind)?.label}</b>
              <p>{note.body}</p>
              <button onClick={() => onRemoveNote(note.id)} aria-label="Delete note">×</button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form className="note-composer" onSubmit={submit}>
          <div className="note-kinds">
            {noteKinds.map((item) => (
              <button
                type="button"
                key={item.id}
                className={kind === item.id ? "selected" : ""}
                onClick={() => setKind(item.id)}
              >{item.label}</button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={1200}
            rows={2}
            required
          />
          <div className="form-actions">
            <button className="primary-button compact" type="submit">Save</button>
            <button type="button" className="link-button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="link-button add-note" onClick={() => setOpen(true)}>{label ? `${label} +` : "Add note"}</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

function ContactsView({
  contacts, total, sent, replies, query, filter, busy,
  onQuery, onFilter, onSelect, onExpand, onBack,
}: {
  contacts: Contact[];
  total: number;
  sent: number;
  replies: number;
  query: string;
  filter: string;
  busy: Busy;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onExpand: () => void;
  onBack: () => void;
}) {
  const filters = ["All", "Potential customer", "Founder", "Expert"];
  const grouped = groupBySegment(contacts);

  if (total === 0) {
    return (
      <>
        <h1>Contacts</h1>
        <p className="empty-line">Nothing here yet.</p>
        <button className="primary-button" onClick={onBack}>Go to plan</button>
      </>
    );
  }

  return (
    <>
      <h1>Contacts</h1>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search contacts"
        />
        <div className="filters">
          {filters.map((item) => (
            <button key={item} className={filter === item ? "selected" : ""} onClick={() => onFilter(item)}>{item}</button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="empty-line">No matches.</p>
      ) : (
        <div className="groups">
          {grouped.map(([segment, segmentContacts]) => (
            <details className="group" key={segment} open>
              <summary><h2>{segment}</h2><span>{segmentContacts.length}</span></summary>
              <div className="rows">
                {segmentContacts.map((contact) => (
                  <button className="row" key={contact.id} onClick={() => onSelect(contact.id)}>
                    <span className="row-name"><strong>{contact.name}</strong><small>{contact.role} · {contact.company}</small></span>
                    <span className="row-type">{contact.type}</span>
                    <span className={`status status-${contact.status}`}>{statusLabel(contact.status)}</span>
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      <footer className="list-footer">
        <span>{total} people · {sent} sent · {replies} replies</span>
        <button className="link-button" onClick={onExpand} disabled={busy !== ""}>
          {busy === "contacts" ? "Searching…" : "Expand list"}
        </button>
      </footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function MessagesView({ contacts, messages, onSelect, onCopy, onStatus }: {
  contacts: Contact[];
  messages: Message[];
  onSelect: (id: string) => void;
  onCopy: (contact: Contact) => void;
  onStatus: (contact: Contact, status: ContactStatus) => void;
}) {
  if (contacts.length === 0) {
    return (
      <>
        <h1>Messages</h1>
        <p className="empty-line">Find people first.</p>
      </>
    );
  }

  const ordered = [...contacts].sort((first, second) =>
    statusWeight(second.status) - statusWeight(first.status) || second.fit - first.fit);

  return (
    <>
      <h1>Messages</h1>
      <div className="followups">
        {ordered.map((contact) => {
          const history = messages.filter((item) => item.contactId === contact.id);
          return (
            <article className="followup" key={contact.id}>
              <header>
                <div><strong>{contact.name}</strong><small>{contact.role} · {contact.company}</small></div>
                <span className={`status status-${contact.status}`}>{statusLabel(contact.status)}</span>
              </header>

              <p className="draft">{contact.message}</p>

              {history.length > 0 && (
                <ul className="history">
                  {history.map((item) => (
                    <li key={item.id} className={item.direction}>
                      {item.direction === "outbound" ? "Sent" : "Received"} · {item.channel} · {new Date(item.occurredAt).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              )}

              <div className="actions">
                {contact.linkedinUrl && <a href={contact.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>}
                {contact.contactUrl && <a href={contact.contactUrl} target="_blank" rel="noreferrer">Contact page</a>}
                <button onClick={() => onCopy(contact)}>Copy</button>
                {contact.status === "new" || contact.status === "queued"
                  ? <button onClick={() => onStatus(contact, "contacted")}>Mark sent</button>
                  : contact.status === "contacted"
                    ? <button onClick={() => onStatus(contact, "replied")}>Mark replied</button>
                    : null}
                <button onClick={() => onSelect(contact.id)}>Open</button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Learnings
// ---------------------------------------------------------------------------

function LearningsView({ notes, contacts }: { notes: PlanNote[]; contacts: Contact[] }) {
  if (notes.length === 0) {
    return (
      <>
        <h1>Learnings</h1>
        <p className="empty-line">Add notes to the plan after each conversation.</p>
      </>
    );
  }

  const byKind = (kind: PlanNoteKind) => notes.filter((note) => note.kind === kind);
  const replied = contacts.filter((contact) => contact.status === "replied" || contact.status === "done").length;

  return (
    <>
      <h1>Learnings</h1>
      <p className="counts">
        {byKind("evidence").length} supporting · {byKind("counter").length} contradicting · {byKind("question").length} open · {replied} replies
      </p>

      <div className="groups">
        {groupNotes(notes).map(([segment, segmentNotes]) => (
          <section className="group static" key={segment}>
            <h2>{segment}</h2>
            <ul className="note-list">
              {segmentNotes.map((note) => (
                <li key={note.id} className={`note note-${note.kind}`}>
                  <b>{noteKinds.find((item) => item.id === note.kind)?.label}</b>
                  <p>{note.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function ContactDrawer({ contact, history, onClose, onCopy, onStatus }: {
  contact: Contact;
  history: Message[];
  onClose: () => void;
  onCopy: () => void;
  onStatus: (status: ContactStatus) => void;
}) {
  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={contact.name}>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close" />
      <aside className="drawer">
        <button className="close-button" onClick={onClose} aria-label="Close panel">×</button>

        <h2>{contact.name}</h2>
        <p className="drawer-role">{contact.role} · {contact.company}</p>
        <p className="drawer-meta">{contact.sector} · {contact.type} · {contact.fit}% fit</p>

        <div className="links">
          {contact.linkedinUrl && <a href={contact.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>}
          {contact.contactUrl && <a href={contact.contactUrl} target="_blank" rel="noreferrer">Contact page</a>}
          {contact.sourceUrl && contact.sourceUrl !== contact.linkedinUrl && (
            <a href={contact.sourceUrl} target="_blank" rel="noreferrer">Source</a>
          )}
        </div>

        <p className="drawer-text">{contact.reason}</p>
        <p className="drawer-text">{contact.angle}</p>

        <div className="draft">{contact.message}</div>
        <button className="link-button" onClick={onCopy}>Copy message</button>

        {history.length > 0 && (
          <ul className="history">
            {history.map((item) => (
              <li key={item.id} className={item.direction}>
                {item.direction === "outbound" ? "Sent" : "Received"} · {item.channel} · {new Date(item.occurredAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}

        <div className="drawer-status">
          {(["contacted", "replied", "scheduled", "done", "passed"] as ContactStatus[]).map((status) => (
            <button
              key={status}
              className={contact.status === status ? "selected" : ""}
              onClick={() => onStatus(status)}
            >{statusLabel(status)}</button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ExpandModal({ onClose, onExpand }: { onClose: () => void; onExpand: (guidance: string) => void }) {
  const [guidance, setGuidance] = useState("");
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="expand-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <form
        className="modal"
        onSubmit={(event) => { event.preventDefault(); onExpand(guidance.trim().slice(0, 600)); }}
      >
        <h2 id="expand-title">Expand list</h2>
        <label>
          Extra instructions
          <textarea
            value={guidance}
            onChange={(event) => setGuidance(event.target.value)}
            rows={3}
            maxLength={600}
          />
        </label>
        <div className="form-actions">
          <button className="primary-button">Search</button>
          <button type="button" className="link-button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function groupBySegment(contacts: Contact[]): Array<[string, Contact[]]> {
  const grouped = new Map<string, Contact[]>();
  contacts.forEach((contact) => {
    const segment = contact.sector || "Unsorted";
    grouped.set(segment, [...(grouped.get(segment) ?? []), contact]);
  });
  return [...grouped.entries()];
}

function groupNotes(notes: PlanNote[]): Array<[string, PlanNote[]]> {
  const grouped = new Map<string, PlanNote[]>();
  notes.forEach((note) => {
    const segment = note.segment || "Mission";
    grouped.set(segment, [...(grouped.get(segment) ?? []), note]);
  });
  return [...grouped.entries()];
}

function statusLabel(status: ContactStatus): string {
  return { new: "New", queued: "Queued", contacted: "Contacted", replied: "Replied", scheduled: "Booked", done: "Done", passed: "Passed" }[status];
}

function statusWeight(status: ContactStatus): number {
  return { replied: 5, scheduled: 4, contacted: 3, new: 2, queued: 2, done: 1, passed: 0 }[status];
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    setShowPassword(false);
    setShowConfirmPassword(false);
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
                <div className="password-input-wrap">
                  <input type={showPassword ? "text" : "password"} required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
                  <button type="button" className="password-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
                </div>
              </label>
            )}
            {(mode === "signup" || mode === "reset") && (
              <label>Confirm password<div className="password-input-wrap"><input type={showConfirmPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" /><button type="button" className="password-visibility" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword}>{showConfirmPassword ? "Hide" : "Show"}</button></div></label>
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
