create extension if not exists pgcrypto;

create table if not exists public.gmail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gmail_connections enable row level security;
revoke all on public.gmail_connections from anon, authenticated;

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paused', 'completed', 'cancelled')),
  timezone text not null default 'Europe/Madrid',
  daily_limit integer not null default 10 check (daily_limit between 1 and 50),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_user_idx on public.email_campaigns(user_id, created_at desc);
alter table public.email_campaigns enable row level security;

create policy "Users can read their email campaigns" on public.email_campaigns
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their email campaigns" on public.email_campaigns
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their email campaigns" on public.email_campaigns
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their draft email campaigns" on public.email_campaigns
  for delete to authenticated using ((select auth.uid()) = user_id and status = 'draft');

create table if not exists public.scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null,
  contact_id text not null,
  recipient_email text not null,
  recipient_name text not null,
  subject text not null,
  body text not null,
  scheduled_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'queued', 'sending', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists scheduled_emails_due_idx on public.scheduled_emails(status, scheduled_at);
create index if not exists scheduled_emails_user_idx on public.scheduled_emails(user_id, created_at desc);
alter table public.scheduled_emails enable row level security;

create policy "Users can read their scheduled emails" on public.scheduled_emails
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their scheduled emails" on public.scheduled_emails
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their scheduled emails" on public.scheduled_emails
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their draft scheduled emails" on public.scheduled_emails
  for delete to authenticated using ((select auth.uid()) = user_id and status = 'draft');

grant select, insert, update, delete on public.email_campaigns to authenticated;
grant select, insert, update, delete on public.scheduled_emails to authenticated;
