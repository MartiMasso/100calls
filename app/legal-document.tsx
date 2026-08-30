import Link from "next/link";
import type { ReactNode } from "react";

export type LegalSection = { id: string; heading: string; content: ReactNode };

export function LegalDocument({ eyebrow, title, summary, updated, effective, sections, related }: {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  effective: string;
  sections: LegalSection[];
  related: { href: string; label: string };
}) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" href="/"><span className="brand-mark">100</span><span>CALLS</span></Link>
        <Link className="legal-back" href="/">← Back to the app</Link>
      </header>

      <div className="legal-shell">
        <div className="legal-intro">
          <span className="step-label">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="legal-summary">{summary}</p>
          <p className="legal-dates"><span>Last updated {updated}</span><span>In force since {effective}</span></p>
        </div>

        <nav className="legal-toc" aria-label="Document sections">
          <span className="eyebrow">CONTENTS</span>
          <ol>
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`}><b>{String(index + 1).padStart(2, "0")}</b>{section.heading}</a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="legal-body">
          {sections.map((section, index) => (
            <section id={section.id} key={section.id}>
              <h2><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{section.heading}</h2>
              {section.content}
            </section>
          ))}
        </article>
      </div>

      <footer className="legal-footer">
        <div>
          <span className="eyebrow">KEEP READING</span>
          <Link href={related.href}>{related.label} <span aria-hidden="true">→</span></Link>
        </div>
        <small>100 Calls · Talk to the people who truly matter</small>
      </footer>
    </main>
  );
}
