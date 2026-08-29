create table if not exists public.mission_workspaces (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null check (char_length(mission_id) between 1 and 100),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, mission_id)
);

alter table public.mission_workspaces enable row level security;

revoke all on table public.mission_workspaces from anon;
grant select, insert, update, delete on table public.mission_workspaces to authenticated;

drop policy if exists "Users can read their own mission workspaces" on public.mission_workspaces;
create policy "Users can read their own mission workspaces"
  on public.mission_workspaces
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own mission workspaces" on public.mission_workspaces;
create policy "Users can create their own mission workspaces"
  on public.mission_workspaces
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own mission workspaces" on public.mission_workspaces;
create policy "Users can update their own mission workspaces"
  on public.mission_workspaces
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own mission workspaces" on public.mission_workspaces;
create policy "Users can delete their own mission workspaces"
  on public.mission_workspaces
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
