"use client";

import { FormEvent, useMemo, useState } from "react";

type View = "radar" | "contactos" | "mensajes" | "aprendizajes";
type Contact = {
  id: number;
  initials: string;
  name: string;
  role: string;
  company: string;
  reason: string;
  angle: string;
  fit: number;
  type: "Cliente potencial" | "Founder" | "Experto";
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
    reason: "Ha escalado operaciones B2B de 10 a 120 clientes.",
    angle: "Pregúntale qué señales separan un problema molesto de uno por el que un equipo paga hoy.",
    fit: 96,
    type: "Experto",
    color: "coral",
    warm: "2 contactos en común",
  },
  {
    id: 2,
    initials: "JR",
    name: "Javier Ríos",
    role: "Fundador",
    company: "CobroSimple",
    reason: "Construyó una solución cercana a tu hipótesis.",
    angle: "Contrasta por qué el mercado elige automatizar cobros y cuándo sigue prefiriendo Excel.",
    fit: 91,
    type: "Founder",
    color: "mint",
    warm: "Presentación posible vía Álex",
  },
  {
    id: 3,
    initials: "SM",
    name: "Sofía Mena",
    role: "CFO",
    company: "Cobee",
    reason: "Decide sobre herramientas financieras para pymes.",
    angle: "Explora el coste real del seguimiento manual y quién siente el dolor dentro del equipo.",
    fit: 88,
    type: "Cliente potencial",
    color: "blue",
    warm: "Contacto directo",
  },
];

const discoveredContacts: Contact[] = [
  {
    id: 4,
    initials: "AG",
    name: "Alba Gómez",
    role: "Head of Finance",
    company: "Factorial",
    reason: "Conoce la operativa financiera de empresas en crecimiento.",
    angle: "Valida si los impagos son una prioridad recurrente o un problema estacional.",
    fit: 86,
    type: "Cliente potencial",
    color: "yellow",
    warm: "1 contacto en común",
  },
  {
    id: 5,
    initials: "DP",
    name: "Diego Pardo",
    role: "Advisor fintech",
    company: "SeedRocket",
    reason: "Ha acompañado a 20+ startups financieras en fase inicial.",
    angle: "Pídele patrones de fracaso y una introducción a dos perfiles especialmente críticos.",
    fit: 84,
    type: "Experto",
    color: "lilac",
    warm: "Presentación posible vía Marta",
  },
  {
    id: 6,
    initials: "CN",
    name: "Clara Navarro",
    role: "CEO",
    company: "Studio Norte",
    reason: "Gestiona una pyme de servicios con cobros recurrentes.",
    angle: "Reconstruye su último impago: qué ocurrió, cuánto costó y cómo lo resolvió.",
    fit: 81,
    type: "Cliente potencial",
    color: "pink",
    warm: "Contacto directo",
  },
];

const tabs: { id: View; label: string; icon: string }[] = [
  { id: "radar", label: "Radar", icon: "◐" },
  { id: "contactos", label: "Contactos", icon: "☷" },
  { id: "mensajes", label: "Mensajes", icon: "✎" },
  { id: "aprendizajes", label: "Aprendizajes", icon: "◇" },
];

export default function Home() {
  const [view, setView] = useState<View>("radar");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [discovered, setDiscovered] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [contacted, setContacted] = useState<number[]>([2]);
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");
  const [showMission, setShowMission] = useState(false);
  const [toast, setToast] = useState("");
  const [mission, setMission] = useState({
    title: "Validar una herramienta que reduzca los impagos en pymes",
    audience: "responsables financieros, founders B2B y expertos en cobros",
    question: "problema, urgencia y disposición a pagar",
  });

  const contacts = discovered ? [...primaryContacts, ...discoveredContacts] : primaryContacts;
  const filteredContacts = useMemo(() => contacts.filter((contact) => {
    const matchesType = filter === "Todos" || contact.type === filter;
    const haystack = `${contact.name} ${contact.role} ${contact.company}`.toLowerCase();
    return matchesType && haystack.includes(query.toLowerCase());
  }), [contacts, filter, query]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const findContacts = () => {
    if (discovered) {
      setView("contactos");
      return;
    }
    setIsDiscovering(true);
    window.setTimeout(() => {
      setDiscovered(true);
      setIsDiscovering(false);
      notify("3 nuevos contactos encontrados");
    }, 900);
  };

  const markContacted = (id: number) => {
    if (!contacted.includes(id)) setContacted((current) => [...current, id]);
    setSelected(null);
    notify("Contacto movido a seguimiento");
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
    notify("Nueva misión preparada");
  };

  const copyMessage = async (contact: Contact) => {
    const message = `Hola ${contact.name.split(" ")[0]}, estoy explorando una forma de ayudar a pymes a reducir impagos. Tu experiencia en ${contact.company} me parece especialmente relevante. No quiero venderte nada: ¿te apetecería compartir 20 minutos para contrastar lo que estoy aprendiendo?`;
    try { await navigator.clipboard.writeText(message); } catch { /* Clipboard can be unavailable in previews. */ }
    notify("Mensaje copiado");
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("radar")} aria-label="Ir al radar">
          <span className="brand-mark">100</span>
          <span>CALLS</span>
        </button>
        <nav className="side-nav" aria-label="Navegación principal">
          {tabs.map((tab) => (
            <button className={`nav-item ${view === tab.id ? "active" : ""}`} key={tab.id} onClick={() => setView(tab.id)}>
              <span>{tab.icon}</span>{tab.label}
              {tab.id === "contactos" && <b>{contacts.length}</b>}
              {tab.id === "mensajes" && <b>{contacted.length}</b>}
            </button>
          ))}
        </nav>
        <button className="new-mission" onClick={() => setShowMission(true)}><span>+</span> Nueva misión</button>
        <div className="sidebar-bottom">
          <div className="goal-label"><p>Tu objetivo</p><strong>{12 + contacted.length} / 100</strong></div>
          <div className="progress-track"><span style={{ width: `${12 + contacted.length}%` }} /></div>
          <small>Conversaciones activadas</small>
        </div>
      </aside>

      <div className="mobile-header">
        <button className="brand" onClick={() => setView("radar")}><span className="brand-mark">100</span><span>CALLS</span></button>
        <select aria-label="Cambiar sección" value={view} onChange={(event) => setView(event.target.value as View)}>
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
            onViewAll={() => setView("contactos")}
            onEditMission={() => setShowMission(true)}
          />
        )}

        {view === "contactos" && (
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

        {view === "mensajes" && (
          <MessagesView contacts={contacts} contacted={contacted} onSelect={setSelected} onCopy={copyMessage} />
        )}

        {view === "aprendizajes" && <LearningsView />}
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
        <div><span className="eyebrow">BUENOS DÍAS, MARTÍ</span><h1>Habla con quien de verdad importa.</h1></div>
        <button className="avatar" aria-label="Abrir perfil">MM</button>
      </header>

      <section className="mission-card">
        <div className="mission-copy">
          <div className="mission-label"><span className="pill">MISIÓN ACTIVA</span><button onClick={onEditMission}>Editar</button></div>
          <h2>{mission.title}</h2>
          <p>Buscamos {mission.audience} para contrastar {mission.question}.</p>
        </div>
        <button className="primary-button" onClick={onFind} disabled={isDiscovering}>
          {isDiscovering ? <><i className="spinner" /> Buscando perfiles</> : <>{discovered ? "Explorar contactos" : "Encontrar contactos"}<span>→</span></>}
        </button>
      </section>

      <div className="signal-row">
        <div><strong>24</strong><span>perfiles analizados</span></div>
        <div><strong>8</strong><span>introducciones posibles</span></div>
        <div><strong>3</strong><span>entrevistas esta semana</span></div>
        <p><span className="pulse" /> Tu radar está actualizado</p>
      </div>

      <div className="section-heading">
        <div><span className="eyebrow">TU PRÓXIMO MOVIMIENTO</span><h2>3 personas que deberías conocer</h2></div>
        <button className="text-button" onClick={onViewAll}>Ver todos <span>↗</span></button>
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
  const filters = ["Todos", "Cliente potencial", "Founder", "Experto"];
  return (
    <>
      <PageHeader eyebrow="MAPA DE PERSONAS" title="Contactos estratégicos" subtitle={`${total} perfiles priorizados para tu hipótesis actual.`} />
      <div className="contact-toolbar">
        <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar por nombre, cargo o empresa" /></label>
        <button className="primary-button compact" onClick={onFind}>+ Ampliar radar</button>
      </div>
      <div className="filter-row" aria-label="Filtrar contactos">
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
              <span className={`status ${contacted.includes(contact.id) ? "done" : ""}`}><i />{contacted.includes(contact.id) ? "Contactado" : "Pendiente"}</span>
              <span className="fit plain">{contact.fit}%</span>
              <span className="row-arrow">→</span>
            </button>
          ))}
        </div>
      ) : <div className="empty-state"><strong>No hay coincidencias</strong><p>Prueba con otro nombre, cargo o tipo de contacto.</p></div>}
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
      <PageHeader eyebrow="OUTREACH HUMANO" title="Mensajes con contexto" subtitle="Personaliza el porqué, pide poco y aprende mucho." />
      <div className="message-layout">
        <section className="queue-panel">
          <div className="panel-heading"><span>COLA DE CONTACTO</span><b>{contacts.length}</b></div>
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
          <span className="eyebrow">PLANTILLA RECOMENDADA</span>
          <h2>Una invitación breve, específica y sin vender.</h2>
          <div className="message-paper">
            <p>Hola <mark>[nombre]</mark>, estoy explorando una forma de ayudar a pymes a reducir impagos.</p>
            <p>Tu experiencia en <mark>[empresa]</mark> me parece especialmente relevante. No quiero venderte nada: ¿te apetecería compartir 20 minutos para contrastar lo que estoy aprendiendo?</p>
            <p>Gracias,<br />Martí</p>
          </div>
          <div className="message-tip"><span>↗</span><p><strong>Mejora la respuesta</strong>Añade una razón concreta por la que has elegido a esa persona.</p></div>
          <button className="primary-button" onClick={() => onCopy(contacts[0])}>Copiar con datos de Laura <span>→</span></button>
        </section>
      </div>
    </>
  );
}

function LearningsView() {
  return (
    <>
      <PageHeader eyebrow="NO ACUMULES NOTAS, ENCUENTRA SEÑALES" title="Lo que estás aprendiendo" subtitle="Síntesis provisional de 12 conversaciones." />
      <div className="learning-grid">
        <article className="learning-hero">
          <span className="pill">SEÑAL FUERTE</span>
          <strong>8 de 12</strong>
          <h2>El seguimiento manual consume más tiempo que el propio impago.</h2>
          <p>La urgencia aparece al superar 30 facturas recurrentes. Antes de ese punto, las hojas de cálculo siguen siendo “suficientemente buenas”.</p>
        </article>
        <article className="hypothesis-card">
          <div className="hypothesis-top"><span>HIPÓTESIS 01</span><b className="validated">VALIDANDO</b></div>
          <h3>Las pymes pagarían por automatizar recordatorios.</h3>
          <div className="evidence"><span style={{ width: "68%" }} /></div>
          <p>5 evidencias a favor · 2 en contra</p>
        </article>
        <article className="hypothesis-card">
          <div className="hypothesis-top"><span>HIPÓTESIS 02</span><b>ABIERTA</b></div>
          <h3>El CFO es quien decide la compra.</h3>
          <div className="evidence"><span style={{ width: "42%" }} /></div>
          <p>3 evidencias a favor · 4 por aclarar</p>
        </article>
      </div>
      <section className="next-questions">
        <div><span className="eyebrow">PRÓXIMAS PREGUNTAS</span><h2>Lo que aún necesitas descubrir</h2></div>
        <ol>
          <li><span>01</span>¿Cuánto cuesta hoy resolver un impago de principio a fin?</li>
          <li><span>02</span>¿Qué evento hace que una pyme busque una solución?</li>
          <li><span>03</span>¿Quién usaría la herramienta y quién aprobaría el gasto?</li>
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
      <div className="card-topline"><div className={`contact-avatar ${contact.color}`}>{contact.initials}</div><span className="fit"><i /> {contact.fit}% encaje</span></div>
      <h3>{contact.name}</h3><p className="role">{contact.role} · {contact.company}</p>
      <div className="why"><span>POR QUÉ AHORA</span><p>{contact.reason}</p></div>
      <button className="card-button" onClick={() => onSelect(contact)}>Preparar contacto <span>→</span></button>
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
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={`Preparar contacto con ${contact.name}`}>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Cerrar" />
      <aside className="drawer">
        <button className="close-button" onClick={onClose} aria-label="Cerrar panel">×</button>
        <div className="drawer-profile"><span className={`contact-avatar large ${contact.color}`}>{contact.initials}</span><div><span className="fit"><i /> {contact.fit}% encaje</span><h2>{contact.name}</h2><p>{contact.role} · {contact.company}</p></div></div>
        <div className="warm-path"><span>≈</span><div><strong>Mejor vía de entrada</strong><p>{contact.warm}</p></div></div>
        <section className="drawer-section"><span className="eyebrow">ENFOQUE DE LA CONVERSACIÓN</span><p>{contact.angle}</p></section>
        <section className="drawer-section"><span className="eyebrow">MENSAJE SUGERIDO</span><div className="draft-message"><p>Hola {contact.name.split(" ")[0]}, estoy explorando una forma de ayudar a pymes a reducir impagos.</p><p>Tu experiencia en {contact.company} me parece especialmente relevante. No quiero venderte nada: ¿te apetecería compartir 20 minutos para contrastar lo que estoy aprendiendo?</p></div><button className="copy-button" onClick={onCopy}>Copiar mensaje <span>⧉</span></button></section>
        <button className={`primary-button drawer-cta ${isContacted ? "completed" : ""}`} onClick={onContact} disabled={isContacted}>{isContacted ? "Ya está en seguimiento" : "Marcar como contactado"}<span>{isContacted ? "✓" : "→"}</span></button>
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
      <button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" />
      <form className="mission-modal" onSubmit={onSave}>
        <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar modal">×</button>
        <span className="step-label">NUEVA MISIÓN · PASO 1 DE 1</span>
        <h2 id="mission-title">Convierte tu idea en una pregunta que el mercado pueda responder.</h2>
        <label>¿Qué quieres validar?<textarea name="idea" required defaultValue={mission.title} rows={3} /></label>
        <label>¿Con qué perfiles necesitas hablar?<input name="audience" required defaultValue={mission.audience} /></label>
        <label>¿Qué necesitas aprender?<input name="question" required defaultValue={mission.question} /></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Crear mi radar <span>→</span></button></div>
      </form>
    </div>
  );
}
