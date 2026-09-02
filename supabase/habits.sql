-- Run this in the Supabase SQL Editor after lock-coach-role.sql (paste
-- the whole file, click Run).
--
-- Adds two tables:
--   habits       one row per habit a coach defines for a client (just a name)
--   habit_logs   one row per day a client marks a habit complete
--
-- A habit can only be logged once per day (the "unique" rule on
-- habit_logs) — that's what makes a checked-off habit stay checked
-- rather than letting a second tap create a duplicate.

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.habits enable row level security;

drop policy if exists "Coaches can view their own habits" on public.habits;
create policy "Coaches can view their own habits"
  on public.habits for select
  using (auth.uid() = coach_id);

-- Same shape as the assignments insert rule: you must be a coach, and
-- the client you're picking must actually be a client.
drop policy if exists "Coaches can create habits" on public.habits;
create policy "Coaches can create habits"
  on public.habits for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
    and exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
  );

drop policy if exists "Clients can view their own habits" on public.habits;
create policy "Clients can view their own habits"
  on public.habits for select
  using (auth.uid() = client_id);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

alter table public.habit_logs enable row level security;

drop policy if exists "Clients can view their own habit logs" on public.habit_logs;
create policy "Clients can view their own habit logs"
  on public.habit_logs for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can log their own habits" on public.habit_logs;
create policy "Clients can log their own habits"
  on public.habit_logs for insert
  with check (
    auth.uid() = client_id
    and exists (select 1 from public.habits h where h.id = habit_id and h.client_id = auth.uid())
  );
