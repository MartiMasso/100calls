-- 100 Calls · workspace schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- It is idempotent: re-running it is safe.

-- ---------------------------------------------------------------------------
-- Missions: one market-discovery objective.
-- ---------------------------------------------------------------------------
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  audience text not null,
  question text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plans: every strategy version for a mission. Plans are never overwritten,
-- so the mission keeps a readable history of how the thinking evolved.
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  version integer not null default 1,
  objective text not null,
  hypothesis text not null,
  recommended_interviews integer not null default 12,
  segments jsonb not null default '[]'::jsonb,
  sequence jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  revision_summary text not null default '',
  model text not null default '',
  created_at timestamptz not null default now(),
  unique (mission_id, version)
);

-- ---------------------------------------------------------------------------
-- Plan notes: the margin comments that make the plan a living document.
-- A note can hang off a specific segment or off the plan as a whole.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  plan_id uuid references public.plans (id) on delete set null,
  contact_id uuid,
  segment text not null default '',
  kind text not null default 'evidence' check (kind in ('evidence', 'counter', 'question', 'decision')),
  body text not null,
  applied_to_plan_id uuid references public.plans (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contacts: candidate people found for a mission.
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  name text not null,
  initials text not null default '',
  role text not null default '',
  company text not null default '',
  sector text not null default '',
  reason text not null default '',
  angle text not null default '',
  fit integer not null default 60,
  type text not null default 'Expert',
  search_path text not null default '',
  message text not null default '',
  source_url text not null default '',
  linkedin_url text not null default '',
  contact_method text not null default '',
  contact_url text not null default '',
  status text not null default 'new'
    check (status in ('new', 'queued', 'contacted', 'replied', 'scheduled', 'done', 'passed')),
  wave integer not null default 1,
  ai_generated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Messages: every outreach exchanged through 100 Calls, in both directions.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null default 'email' check (channel in ('email', 'linkedin', 'form', 'call', 'other')),
  subject text not null default '',
  body text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Late-added link: keep plan notes traceable to the conversation that produced them.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plan_notes_contact_id_fkey'
  ) then
    alter table public.plan_notes
      add constraint plan_notes_contact_id_fkey
      foreign key (contact_id) references public.contacts (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists missions_user_idx on public.missions (user_id, created_at desc);
create index if not exists plans_mission_idx on public.plans (mission_id, version desc);
create index if not exists plan_notes_mission_idx on public.plan_notes (mission_id, created_at desc);
create index if not exists contacts_mission_idx on public.contacts (mission_id, created_at desc);
create index if not exists contacts_status_idx on public.contacts (mission_id, status);
create index if not exists messages_contact_idx on public.messages (contact_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Row level security: a signed-in user only ever sees their own rows.
-- ---------------------------------------------------------------------------
alter table public.missions enable row level security;
alter table public.plans enable row level security;
alter table public.plan_notes enable row level security;
alter table public.contacts enable row level security;
alter table public.messages enable row level security;

do $$
declare
  target text;
begin
  foreach target in array array['missions', 'plans', 'plan_notes', 'contacts', 'messages'] loop
    execute format('drop policy if exists %I on public.%I', target || '_owner_select', target);
    execute format('drop policy if exists %I on public.%I', target || '_owner_insert', target);
    execute format('drop policy if exists %I on public.%I', target || '_owner_update', target);
    execute format('drop policy if exists %I on public.%I', target || '_owner_delete', target);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      target || '_owner_select', target);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      target || '_owner_insert', target);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      target || '_owner_update', target);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      target || '_owner_delete', target);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists missions_touch_updated_at on public.missions;
create trigger missions_touch_updated_at
  before update on public.missions
  for each row execute function public.touch_updated_at();

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_updated_at();
