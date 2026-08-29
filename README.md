# 100 Calls

100 Calls helps early-stage founders find strategic people, prepare outreach,
and turn conversations into market-validation evidence.

## What works today

- Email/password sign-up and sign-in through Supabase Auth
- Email confirmation when enabled in Supabase
- Password recovery and password updates
- Persistent Supabase sessions and sign-out
- Google sign-in through Supabase OAuth (after enabling the provider)
- GPT-powered public-web research for grounded strategic contacts
- Source links, fit ranking, conversation angles, and personalized outreach
- Mission strategy, contacts, learnings, and follow-up state persisted in Supabase
- Reviewable Gmail campaigns with explicit authorization, pause, and cancellation
- Per-user request limits and server-side API-key protection
- Deployments through OpenAI Sites or Vercel

## Local setup

Requires Node.js `22.x`.

1. Copy `.env.example` to `.env.local`.
2. Add the Supabase project URL, public key, and a server-only OpenAI API key.
3. Install and run:

```bash
npm install
npm run dev
```

The local app runs at `http://localhost:3000`.

## Supabase Auth configuration

In Supabase, open **Authentication → URL Configuration** and configure:

- **Site URL:** your final production domain.
- **Redirect URLs:**
  - `http://localhost:3000/**`
  - `https://one-hundred-calls.martimm0202.chatgpt.site/**`
  - Your exact Vercel production domain.
  - For Vercel previews: `https://*-<your-vercel-team>.vercel.app/**`

Under **Authentication → Providers → Email**, keep email/password enabled.
Enable **Confirm Email** if every new account should verify its email before
signing in. Configure custom SMTP before production email volume; Supabase's
default email service is intended for testing and has a low sending limit.

For Google sign-in, create a Web OAuth client in Google Cloud, use
`https://aavkaczgsjdnkufhdpie.supabase.co/auth/v1/callback` as its authorized
redirect URI, and add `https://100calls-nu.vercel.app` as an authorized
JavaScript origin. Then enable Google under **Authentication → Sign In /
Providers** and add the Google Client ID and Client Secret. Finally, allow
`https://100calls-nu.vercel.app/auth/callback` under **Authentication → URL
Configuration**.

## Deploy to Vercel

The repository includes `vercel.json` and a standard Next.js build command.
Import the GitHub repository into Vercel and add these environment variables to
Production, Preview, and Development:

```text
NEXT_PUBLIC_SUPABASE_URL=https://aavkaczgsjdnkufhdpie.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your public anon key>
OPENAI_API_KEY=<your server-only OpenAI API key>
OPENAI_MODEL=gpt-5.6-luna
SUPABASE_SERVICE_ROLE_KEY=<your server-only Supabase service-role key>
GOOGLE_GMAIL_CLIENT_ID=<dedicated Gmail OAuth client ID>
GOOGLE_GMAIL_CLIENT_SECRET=<dedicated Gmail OAuth client secret>
GOOGLE_GMAIL_REDIRECT_URI=https://www.100calls.co/api/auth/gmail/callback
EMAIL_SCHEDULER_SECRET=<a long random server-only value>
```

Set `OPENAI_API_KEY` as a **Secret**. Never prefix it with `NEXT_PUBLIC_`.
`OPENAI_MODEL` is ordinary configuration and can remain `gpt-5.6-luna`.

Vercel will run `npm run build:vercel`. For local Vercel-compatible development,
use `npm run dev:vercel`.

## Gmail campaigns

Gmail sending uses a separate Google OAuth client from Supabase sign-in. Its
authorized redirect URIs must exactly include:

- `https://www.100calls.co/api/auth/gmail/callback`
- `https://100calls.co/api/auth/gmail/callback` (optional alias)
- `http://localhost:3000/api/auth/gmail/callback`

Only `gmail.send` is requested; the application cannot read the inbox. Refresh
tokens are encrypted before storage. Active campaigns are automatically paused
when Gmail is disconnected.

Run `supabase/migrations/20260829190000_create_gmail_campaigns.sql` in the
Supabase SQL Editor before testing the connection. After the application is
deployed, set the same random `EMAIL_SCHEDULER_SECRET` in Vercel and in
`supabase/email_scheduler_setup.sql`, then run that second file in the SQL
Editor to process approved emails once per minute.

## Other commands

- `npm run build`: validate the OpenAI Sites/vinext build
- `npm run build:vercel`: validate the standard Next.js build
- `npm run lint`: run static checks
