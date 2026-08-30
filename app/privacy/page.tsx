import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "../legal-document";

const UPDATED = "30 August 2026";

export const metadata: Metadata = {
  title: "Privacy Policy · 100 Calls",
  description: "How 100 Calls handles your account data, the contact data you research, and the providers involved in outreach.",
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    content: (
      <>
        <p>
          100 Calls is a research and outreach workspace for founders and researchers. It helps you find strategic
          people, prepare a conversation with them, run the outreach, and turn the answers into evidence.
        </p>
        <p>
          The service is operated by Martí Massó (“100 Calls”, “we”, “us”), based in Spain, reachable at{" "}
          <a href="mailto:privacy@100calls.co">privacy@100calls.co</a>. This policy explains what personal data the
          service processes, why, with whom it is shared, and the rights you and the people you contact can exercise.
        </p>
        <p>
          It applies to <b>100calls.co</b> and to the application behind it. It does not apply to the websites of the
          providers we connect to, or to the people and companies you research, each of which has its own policies.
        </p>
      </>
    ),
  },
  {
    id: "two-roles",
    heading: "The two roles we play",
    content: (
      <>
        <p>This distinction decides who is responsible for what, so it comes first.</p>
        <ul>
          <li>
            <b>Your account data — we are the controller.</b> Your email address, sign-in method, sender identity and
            usage of the product are processed by us, for our own purposes, under this policy.
          </li>
          <li>
            <b>The contact data inside your missions — you are the controller and we are your processor.</b> The names,
            roles, companies, public email addresses and notes about the people you decide to research and contact are
            processed by us on your instructions and on your behalf. You decide who is researched, what is written to
            them, and when it is sent. You are responsible for having a lawful basis for that outreach, and for
            answering the requests those people make.
          </li>
        </ul>
        <p>
          Where the law requires a data processing agreement between us for that second role, this policy together with
          our <Link href="/terms">Terms of Use</Link> forms it, and the sub-processors listed below are the ones you authorize
          by using the service.
        </p>
      </>
    ),
  },
  {
    id: "data-we-process",
    heading: "Data we process",
    content: (
      <>
        <p><b>Account and identity data.</b> Your email address, an encrypted password or the Google account you sign in
          with, email confirmation and sign-in timestamps, and your account identifier. Passwords are hashed by our
          authentication provider and are never visible to us.</p>
        <p><b>Sender identity.</b> The name, role, organization, background and email signature you save in outreach
          settings, because a credible message needs a real sender behind it.</p>
        <p><b>Workspace content.</b> Your missions, objectives, context notes, strategies, learnings and follow-up state.</p>
        <p><b>Contact research data.</b> For each candidate: name, role, company, sector, public profile and website
          links, publicly listed email addresses or phone numbers where found, the source URL for each of them, and the
          AI-generated fit assessment, conversation angle and draft messages. This data is gathered from publicly
          available sources on the open web.</p>
        <p><b>Outreach and delivery data.</b> Campaigns, recipients, subjects, message bodies, scheduled send times,
          delivery status, send timestamps and any delivery error returned by the mail provider.</p>
        <p><b>Integration credentials.</b> When you connect Gmail, the refresh token issued by Google, encrypted with
          AES-GCM before it is stored, plus the connected mailbox address and the connection date.</p>
        <p><b>Technical data.</b> Server logs, request metadata, error reports and short-lived rate-limiting counters
          held in memory for fifteen minutes to prevent abuse of the AI endpoints.</p>
        <p>We do not ask for special category data, payment card numbers, or the contents of your inbox, and the Gmail
          permission we request cannot read your mail.</p>
      </>
    ),
  },
  {
    id: "sources",
    heading: "Where the data comes from",
    content: (
      <ul>
        <li><b>From you:</b> your account details, sender identity, missions, notes and approvals.</li>
        <li><b>From public sources:</b> candidate information is assembled by AI-assisted research over publicly
          available web pages, with a source link recorded for the contact details it reports.</li>
        <li><b>From providers you connect:</b> the mailbox address and tokens returned by Google when you authorize
          Gmail sending, and equivalent data from any scheduling or meeting-notes provider you choose to connect later.</li>
      </ul>
    ),
  },
  {
    id: "purposes",
    heading: "Why we process it, and on what legal basis",
    content: (
      <>
        <table className="legal-table">
          <thead><tr><th>Purpose</th><th>Legal basis (GDPR Art. 6)</th></tr></thead>
          <tbody>
            <tr><td>Creating your account, signing you in and keeping your workspace saved</td><td>Performance of a contract, Art. 6(1)(b)</td></tr>
            <tr><td>Running AI research, drafting messages and preparing campaigns</td><td>Performance of a contract, Art. 6(1)(b)</td></tr>
            <tr><td>Sending the emails you have explicitly authorized, at the times you set</td><td>Performance of a contract, Art. 6(1)(b), and your consent for the Gmail connection, Art. 6(1)(a)</td></tr>
            <tr><td>Processing candidate data on your instructions so you can reach professionals about your research</td><td>Your legitimate interest as controller, Art. 6(1)(f), assessed by you</td></tr>
            <tr><td>Security, abuse prevention, rate limiting and debugging</td><td>Our legitimate interest in a safe service, Art. 6(1)(f)</td></tr>
            <tr><td>Answering support requests and enforcing our terms</td><td>Legitimate interest, Art. 6(1)(f), and legal obligation, Art. 6(1)(c)</td></tr>
          </tbody>
        </table>
        <p>
          We do not sell personal data, we do not rent or share contact lists between accounts, and we do not use your
          workspace content or your contacts for advertising.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    heading: "How AI is used",
    content: (
      <>
        <p>
          Research, contact enrichment and message drafting run through the OpenAI API. What is sent for a given request
          is the mission text, your sender identity, and the candidate details relevant to that step. Under the OpenAI
          API terms, content submitted through the API is not used to train their models.
        </p>
        <p>
          AI output can be wrong, outdated or incomplete. Fit rankings, contact details and drafts are suggestions to be
          checked, never facts to be trusted blindly, and every email is held for your explicit authorization before a
          single message leaves your account. There is no automated decision-making that produces legal or similarly
          significant effects on anyone.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    heading: "Providers and integrations",
    content: (
      <>
        <p>We use a small number of providers to run the service. Each acts as our sub-processor and may only process
          data to deliver its part of the service.</p>
        <table className="legal-table">
          <thead><tr><th>Provider</th><th>What it does</th><th>What it can access</th></tr></thead>
          <tbody>
            <tr><td>Supabase</td><td>Authentication and database</td><td>Account data, workspace content, contact records, campaigns and scheduled emails</td></tr>
            <tr><td>OpenAI</td><td>Research, enrichment and message drafting</td><td>Mission text, sender identity and candidate details sent with each request</td></tr>
            <tr><td>Google</td><td>Google sign-in and Gmail sending</td><td>Your Google account email and the messages sent from your mailbox</td></tr>
            <tr><td>Vercel</td><td>Application hosting and delivery</td><td>Request and log data in transit</td></tr>
            <tr><td>Cloudflare</td><td>Edge delivery for some deployments of the application</td><td>Request and log data in transit</td></tr>
          </tbody>
        </table>
        <p><b>Integrations you choose to connect.</b> 100 Calls connects to external tools so that outreach, scheduling
          and conversation notes stay in one flow. Scheduling and meeting-notes providers such as Calendly and Granola
          may be offered as optional connections. Nothing is shared with any of them unless you connect them yourself,
          each connection asks for the narrowest permission that makes the feature work, and disconnecting it stops the
          exchange of data and deletes the stored credential.</p>
        <p><b>Gmail specifically.</b> We request only <code>gmail.send</code>, together with your account identifier and
          email address. That permission allows the application to send messages you have authorized and does not allow
          it to read, search or delete anything in your mailbox. 100 Calls’ use and transfer of information received
          from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy</a>, including the Limited Use requirements. Refresh tokens are
          encrypted before storage, and disconnecting Gmail revokes the token with Google, deletes it, and pauses any
          campaign that depends on it.</p>
      </>
    ),
  },
  {
    id: "transfers",
    heading: "International transfers",
    content: (
      <p>
        Some of the providers above are established in the United States or process data there. Where personal data
        leaves the European Economic Area, the transfer relies on the European Commission’s Standard Contractual
        Clauses, on an adequacy decision such as the EU–US Data Privacy Framework where the provider is certified, or on
        another mechanism permitted by Chapter V of the GDPR, together with the technical measures described below. You
        can request a copy of the relevant safeguards at <a href="mailto:privacy@100calls.co">privacy@100calls.co</a>.
      </p>
    ),
  },
  {
    id: "retention",
    heading: "How long we keep it",
    content: (
      <ul>
        <li><b>Account and workspace data:</b> for as long as your account exists. After you ask for deletion, it is
          removed within 30 days, and from routine backups within 90 days.</li>
        <li><b>Contact records and drafts:</b> for as long as the mission they belong to exists, or until you delete
          them. You can delete an individual candidate at any time.</li>
        <li><b>Scheduled and sent emails:</b> retained for up to 12 months after the send date as a record of what was
          sent, then deleted.</li>
        <li><b>Gmail credentials:</b> deleted and revoked immediately when you disconnect Gmail or delete your account.</li>
        <li><b>Server and security logs:</b> up to 12 months.</li>
        <li><b>Rate-limiting counters:</b> 15 minutes, held in memory only.</li>
      </ul>
    ),
  },
  {
    id: "security",
    heading: "How it is protected",
    content: (
      <ul>
        <li>All traffic runs over TLS, and data at rest is encrypted by our hosting and database providers.</li>
        <li>Gmail refresh tokens are encrypted with AES-GCM before they are written to the database.</li>
        <li>Rows are scoped per user, and every request is authenticated against your session before any data is read.</li>
        <li>Privileged keys, including the AI and database service keys, exist only on the server and are never exposed
          to the browser.</li>
        <li>Emails are never sent without an explicit authorization step, which limits the damage any single mistake or
          compromised session can do.</li>
      </ul>
    ),
  },
  {
    id: "your-rights",
    heading: "Your rights",
    content: (
      <>
        <p>
          If you are in the European Economic Area or the United Kingdom you have the right to access your data, correct
          it, delete it, restrict or object to its processing, receive it in a portable format, and withdraw consent at
          any time without affecting processing already carried out.
        </p>
        <p>
          Write to <a href="mailto:privacy@100calls.co">privacy@100calls.co</a> and we will respond within one month.
          Much of it is immediate inside the product: your account section shows the data held about you, outreach
          settings correct your sender identity, campaigns can be paused or cancelled, and Gmail can be disconnected in
          one click.
        </p>
        <p>
          If you believe we have handled your data badly, you may complain to your supervisory authority. In Spain that
          is the Agencia Española de Protección de Datos, <a href="https://www.aepd.es" target="_blank" rel="noreferrer">aepd.es</a>.
        </p>
      </>
    ),
  },
  {
    id: "contacted-people",
    heading: "If you were contacted through 100 Calls",
    content: (
      <>
        <p>
          If you received an email prepared with 100 Calls, the sender named in that message is the controller of your
          data. They chose to contact you, they decide what to keep, and requests to access, correct or delete your data
          are answered by them.
        </p>
        <p>
          You can still write to <a href="mailto:privacy@100calls.co">privacy@100calls.co</a>. We will forward your
          request to the account that holds your data without undue delay, help them act on it, and, where the request
          is to stop contact, act so that pending messages to you are not sent. Candidate data in 100 Calls comes from
          publicly available professional sources, and the source link for the details used is recorded alongside them,
          so we can tell you where they were found.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    heading: "Cookies and local storage",
    content: (
      <p>
        100 Calls sets one essential cookie that keeps you signed in, valid for up to 400 days, and uses your browser’s
        local storage to migrate sessions created by earlier versions of the app. There are no advertising cookies, no
        third-party trackers and no cross-site profiling, so no consent banner is required. Clearing the cookie signs
        you out.
      </p>
    ),
  },
  {
    id: "children",
    heading: "Age",
    content: (
      <p>
        100 Calls is a professional tool and is not directed at children. You must be at least 18 years old, or the age
        of legal capacity in your country, to hold an account. If we learn that an account belongs to a minor, we will
        delete it.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    content: (
      <p>
        When this policy changes, the date at the top changes with it. If a change materially affects how your data is
        handled, we will tell you inside the product or by email before it takes effect. Continuing to use 100 Calls
        after that date means the updated policy applies.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    content: (
      <p>
        Privacy questions, data requests and complaints: <a href="mailto:privacy@100calls.co">privacy@100calls.co</a>.
        Everything else: <a href="mailto:hello@100calls.co">hello@100calls.co</a>.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      eyebrow="PRIVACY POLICY"
      title="What we do with data, in plain terms."
      summary="100 Calls holds two kinds of personal data: yours, and the data of the people you decide to contact. This policy separates the two, names every provider involved, and explains how each of them can be stopped."
      updated={UPDATED}
      effective={UPDATED}
      sections={sections}
      related={{ href: "/terms", label: "Terms of Use" }}
    />
  );
}
