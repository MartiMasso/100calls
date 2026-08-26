"use client";

import { FormEvent, useMemo, useState } from "react";

type View = "radar" | "contacts" | "messages" | "learnings";
type Contact = {
  id: number;
  initials: string;
  name: string;
  role: string;
  company: string;
  reason: string;
  angle: string;
  fit: number;
  type: "Potential customer" | "Founder" | "Expert";
  color: string;
  warm: string;
};

const primaryContacts: Contact[] = [
  {
    id: 1,
    initials: "LM",
    name: "Laura Martín",
    role: "COO",
    company: "Payflow",
    reason: "She scaled B2B operations from 10 to 120 customers.",
    angle: "Ask her which signals separate an annoying problem from one a team will pay to solve today.",
    fit: 96,
    type: "Expert",
    color: "coral",
    warm: "2 mutual contacts",
  },
  {
    id: 2,
    initials: "JR",
    name: "Javier Ríos",
    role: "Founder",
    company: "CobroSimple",
    reason: "He built a solution closely related to your hypothesis.",
    angle: "Explore why the market chooses to automate collections and when it still prefers Excel.",
    fit: 91,
    type: "Founder",
    color: "mint",
    warm: "Warm introduction possible through Álex",
  },
  {
    id: 3,
    initials: "SM",
    name: "Sofía Mena",
    role: "CFO",
    company: "Cobee",
    reason: "She makes purchasing decisions on financial tools for SMBs.",
    angle: "Explore the true cost of manual follow-up and who feels the pain inside the team.",
    fit: 88,
    type: "Potential customer",
    color: "blue",
    warm: "Direct contact",
  },
];

const discoveredContacts: Contact[] = [
  {
    id: 4,
    initials: "AG",
    name: "Alba Gómez",
    role: "Head of Finance",
    company: "Factorial",
    reason: "She understands the financial operations of growing companies.",
    angle: "Test whether late payments are a recurring priority or a seasonal problem.",
    fit: 86,
    type: "Potential customer",
    color: "yellow",
    warm: "1 mutual contact",
  },
  {
    id: 5,
    initials: "DP",
    name: "Diego Pardo",
    role: "Fintech advisor",
    company: "SeedRocket",
    reason: "He has advised 20+ early-stage fintech startups.",
    angle: "Ask him about recurring failure patterns and for introductions to two especially critical profiles.",
    fit: 84,
    type: "Expert",
    color: "lilac",
    warm: "Warm introduction possible through Marta",
  },
  {
    id: 6,
    initials: "CN",
    name: "Clara Navarro",
    role: "CEO",
    company: "Studio Norte",
    reason: "She runs a service business with recurring payments.",
    angle: "Reconstruct her latest late payment: what happened, what it cost, and how she resolved it.",
    fit: 81,
    type: "Potential customer",
    color: "pink",
    warm: "Direct contact",
  },
];

const tabs: { id: View; label: string; icon: string }[] = [
  { id: "radar", label: "Radar", icon: "◐" },
  { id: "contacts", label: "Contacts", icon: "☷" },
  { id: "messages", label: "Messages", icon: "✎" },
  { id: "learnings", label: "Learnings", icon: "◇" },
];

export default function Home() {
  const [view, setView] = useState<View>("radar");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [discovered, setDiscovered] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [contacted, setContacted] = useState<number[]>([2]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [showMission, setShowMission] = useState(false);
  const [toast, setToast] = useState("");
  const [mission, setMission] = useState({
    title: "Validate a tool that reduces late payments for SMBs",
    audience: "finance leaders, B2B founders, and collections experts",
    question: "the problem, urgency, and willingness to pay",
  });

  const contacts = discovered ? [...primaryContacts, ...discoveredContacts] : primaryContacts;
  const filteredContacts = useMemo(() => contacts.filter((contact) => {
    const matchesType = filter === "All" || contact.type === filter;
    const haystack = `${contact.name} ${contact.role} ${contact.company}`.toLowerCase();
    return matchesType && haystack.includes(query.toLowerCase());
  }), [contacts, filter, query]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const findContacts = () => {
    if (discovered) {
      setView("contacts");
      return;
    }
    setIsDiscovering(true);
    window.setTimeout(() => {
      setDiscovered(true);
      setIsDiscovering(false);
      notify("3 new contacts found");
    }, 900);
  };

  const markContacted = (id: number) => {
    if (!contacted.includes(id)) setContacted((current) => [...current, id]);
    setSelected(null);
    notify("Contact moved to follow-up");
  };

  const saveMission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMission({
      title: String(data.get("idea")),
      audience: String(data.get("audience")),
      question: String(data.get("question")),
    });
    setShowMission(false);
    setDiscovered(false);
    notify("New mission ready");
  };

  const copyMessage = async (contact: Contact) => {
    const message = `Hi ${contact.name.split(" ")[0]}, I'm exploring a way to help SMBs reduce late payments. Your experience at ${contact.company} feels especially relevant. I'm not trying to sell you anything—would you be open to a 20-minute conversation so I can test what I'm learning?`;
    try { await navigator.clipboard.writeText(message); } catch { /* Clipboard can be unavailable in previews. */ }
    notify("Message copied");
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("radar")} aria-label="Go to radar">
          <span className="brand-mark">100</span>
          <span>CALLS</span>
        </button>
        <nav className="side-nav" aria-label="Main navigation">
          {tabs.map((tab) => (
            <button className={`nav-item ${view === tab.id ? "active" : ""}`} key={tab.id} onClick={() => setView(tab.id)}>
              <span>{tab.icon}</span>{tab.label}
              {tab.id === "contacts" && <b>{contacts.length}</b>}
              {tab.id === "messages" && <b>{contacted.length}</b>}
            </button>
          ))}
        </nav>
        <button className="new-mission" onClick={() => setShowMission(true)}><span>+</span> New mission</button>
        <div className="sidebar-bottom">
          <div className="goal-label"><p>Your goal</p><strong>{12 + contacted.length} / 100</strong></div>
          <div className="progress-track"><span style={{ width: `${12 + contacted.length}%` }} /></div>
          <small>Conversations activated</small>
        </div>
      </aside>

      <div className="mobile-header">
        <button className="brand" onClick={() => setView("radar")}><span className="brand-mark">100</span><span>CALLS</span></button>
        <select aria-label="Change section" value={view} onChange={(event) => setView(event.target.value as View)}>
          {tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
      </div>

      <section className="workspace">
        {view === "radar" && (
          <Radar
            contacts={contacts.slice(0, 3)}
            mission={mission}
            isDiscovering={isDiscovering}
            discovered={discovered}
            onFind={findContacts}
            onSelect={setSelected}
            onViewAll={() => setView("contacts")}
            onEditMission={() => setShowMission(true)}
          />
        )}

        {view === "contacts" && (
          <ContactsView
            contacts={filteredContacts}
            total={contacts.length}
            query={query}
            filter={filter}
            contacted={contacted}
            onQuery={setQuery}
            onFilter={setFilter}
            onSelect={setSelected}
            onFind={findContacts}
          />
        )}

        {view === "messages" && (
          <MessagesView contacts={contacts} contacted={contacted} onSelect={setSelected} onCopy={copyMessage} />
        )}

        {view === "learnings" && <LearningsView />}
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

      {showMission && <MissionModal mission={mission} onClose={() => setShowMission(false)} onSave={saveMission} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function Radar({ contacts, mission, isDiscovering, discovered, onFind, onSelect, onViewAll, onEditMission }: {
  contacts: Contact[];
  mission: { title: string; audience: string; question: string };
  isDiscovering: boolean;
  discovered: boolean;
  onFind: () => void;
  onSelect: (contact: Contact) => void;
  onViewAll: () => void;
  onEditMission: () => void;
}) {
  return (
    <>
      <header className="topbar">
        <div><span className="eyebrow">GOOD MORNING, MARTÍ</span><h1>Talk to the people who truly matter.</h1></div>
        <button className="avatar" aria-label="Open profile">MM</button>
      </header>

      <section className="mission-card">
        <div className="mission-copy">
          <div className="mission-label"><span className="pill">ACTIVE MISSION</span><button onClick={onEditMission}>Edit</button></div>
          <h2>{mission.title}</h2>
          <p>We are looking for {mission.audience} to test {mission.question}.</p>
        </div>
        <button className="primary-button" onClick={onFind} disabled={isDiscovering}>
          {isDiscovering ? <><i className="spinner" /> Finding people</> : <>{discovered ? "Explore contacts" : "Find contacts"}<span>→</span></>}
        </button>
      </section>

      <div className="signal-row">
        <div><strong>24</strong><span>profiles analyzed</span></div>
        <div><strong>8</strong><span>possible introductions</span></div>
        <div><strong>3</strong><span>interviews this week</span></div>
        <p><span className="pulse" /> Your radar is up to date</p>
      </div>

      <div className="section-heading">
        <div><span className="eyebrow">YOUR NEXT MOVE</span><h2>3 people you should meet</h2></div>
        <button className="text-button" onClick={onViewAll}>View all <span>↗</span></button>
      </div>

      <div className="contact-grid">
        {contacts.map((contact) => <ContactCard key={contact.id} contact={contact} onSelect={onSelect} />)}
      </div>
    </>
  );
}

function ContactsView({ contacts, total, query, filter, contacted, onQuery, onFilter, onSelect, onFind }: {
  contacts: Contact[];
  total: number;
  query: string;
  filter: string;
  contacted: number[];
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (contact: Contact) => void;
  onFind: () => void;
}) {
  const filters = ["All", "Potential customer", "Founder", "Expert"];
  return (
    <>
      <PageHeader eyebrow="PEOPLE MAP" title="Strategic contacts" subtitle={`${total} profiles prioritized for your current hypothesis.`} />
      <div className="contact-toolbar">
        <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by name, role, or company" /></label>
        <button className="primary-button compact" onClick={onFind}>+ Expand radar</button>
      </div>
      <div className="filter-row" aria-label="Filter contacts">
        {filters.map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => onFilter(item)}>{item}</button>)}
      </div>
      {contacts.length > 0 ? (
        <div className="contact-list">
          {contacts.map((contact) => (
            <button className="contact-list-row" key={contact.id} onClick={() => onSelect(contact)}>
              <span className={`contact-avatar ${contact.color}`}>{contact.initials}</span>
              <span className="contact-person"><strong>{contact.name}</strong><small>{contact.role} · {contact.company}</small></span>
              <span className="type-tag">{contact.type}</span>
              <span className="contact-reason">{contact.reason}</span>
              <span className={`status ${contacted.includes(contact.id) ? "done" : ""}`}><i />{contacted.includes(contact.id) ? "Contacted" : "Pending"}</span>
              <span className="fit plain">{contact.fit}%</span>
              <span className="row-arrow">→</span>
            </button>
          ))}
        </div>
      ) : <div className="empty-state"><strong>No matches found</strong><p>Try a different name, role, or contact type.</p></div>}
    </>
  );
}

function MessagesView({ contacts, contacted, onSelect, onCopy }: {
  contacts: Contact[];
  contacted: number[];
  onSelect: (contact: Contact) => void;
  onCopy: (contact: Contact) => void;
}) {
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
          <div className="message-paper">
            <p>Hi <mark>[name]</mark>, I&apos;m exploring a way to help SMBs reduce late payments.</p>
            <p>Your experience at <mark>[company]</mark> feels especially relevant. I&apos;m not trying to sell you anything—would you be open to a 20-minute conversation so I can test what I&apos;m learning?</p>
            <p>Thanks,<br />Martí</p>
          </div>
          <div className="message-tip"><span>↗</span><p><strong>Improve your response rate</strong>Add one specific reason why you chose that person.</p></div>
          <button className="primary-button" onClick={() => onCopy(contacts[0])}>Copy with Laura&apos;s details <span>→</span></button>
        </section>
      </div>
    </>
  );
}

function LearningsView() {
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
      <div className="why"><span>WHY NOW</span><p>{contact.reason}</p></div>
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
        <div className="drawer-profile"><span className={`contact-avatar large ${contact.color}`}>{contact.initials}</span><div><span className="fit"><i /> {contact.fit}% fit</span><h2>{contact.name}</h2><p>{contact.role} · {contact.company}</p></div></div>
        <div className="warm-path"><span>≈</span><div><strong>Best way in</strong><p>{contact.warm}</p></div></div>
        <section className="drawer-section"><span className="eyebrow">CONVERSATION ANGLE</span><p>{contact.angle}</p></section>
        <section className="drawer-section"><span className="eyebrow">SUGGESTED MESSAGE</span><div className="draft-message"><p>Hi {contact.name.split(" ")[0]}, I&apos;m exploring a way to help SMBs reduce late payments.</p><p>Your experience at {contact.company} feels especially relevant. I&apos;m not trying to sell you anything—would you be open to a 20-minute conversation so I can test what I&apos;m learning?</p></div><button className="copy-button" onClick={onCopy}>Copy message <span>⧉</span></button></section>
        <button className={`primary-button drawer-cta ${isContacted ? "completed" : ""}`} onClick={onContact} disabled={isContacted}>{isContacted ? "Already in follow-up" : "Mark as contacted"}<span>{isContacted ? "✓" : "→"}</span></button>
      </aside>
    </div>
  );
}

function MissionModal({ mission, onClose, onSave }: {
  mission: { title: string; audience: string; question: string };
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="mission-title">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
      <form className="mission-modal" onSubmit={onSave}>
        <button type="button" className="close-button" onClick={onClose} aria-label="Close modal">×</button>
        <span className="step-label">NEW MISSION · STEP 1 OF 1</span>
        <h2 id="mission-title">Turn your idea into a question the market can answer.</h2>
        <label>What do you want to validate?<textarea name="idea" required defaultValue={mission.title} rows={3} /></label>
        <label>Which profiles do you need to speak with?<input name="audience" required defaultValue={mission.audience} /></label>
        <label>What do you need to learn?<input name="question" required defaultValue={mission.question} /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Build my radar <span>→</span></button></div>
      </form>
    </div>
  );
}
