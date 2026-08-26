# 100 Calls

100 Calls helps early-stage founders find strategic people, prepare outreach,
and turn conversations into market-validation evidence.

## What works today

- Email/password sign-up and sign-in through Supabase Auth
- Email confirmation when enabled in Supabase
- Password recovery and password updates
- Persistent Supabase sessions and sign-out
- Interactive contact radar, outreach drafts, and learning views
- Deployments through OpenAI Sites or Vercel

The contacts, mission, progress, and learnings currently use demonstration data
and local React state. Authentication is real; product records are not yet saved
to Supabase. The next backend step is to create user-owned tables with Row Level
Security policies based on `auth.uid()`.

## Local setup

Requires Node.js `>=22.13.0`.

1. Copy `.env.example` to `.env.local`.
2. Add the Supabase project URL and public anon key.
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

## Deploy to Vercel

The repository includes `vercel.json` and a standard Next.js build command.
Import the GitHub repository into Vercel and add these environment variables to
Production, Preview, and Development:

```text
NEXT_PUBLIC_SUPABASE_URL=https://aavkaczgsjdnkufhdpie.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your public anon key>
```

Vercel will run `npm run build:vercel`. For local Vercel-compatible development,
use `npm run dev:vercel`.

## Other commands

- `npm run build`: validate the OpenAI Sites/vinext build
- `npm run build:vercel`: validate the standard Next.js build
- `npm run lint`: run static checks
