-- Run this in the Supabase SQL Editor after schema.sql and workouts.sql
-- (same process: paste the whole file, click Run).
--
-- Adds an "assignments" table linking one workout + one client + one date,
-- so a coach can hand a specific workout to a specific client to do on a
-- specific day. Also adds one new policy on profiles so a coach can see
-- the list of client accounts to assign to — previously a coach could
-- only see their own profile row, nobody else's.

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  assigned_date date not null,
  created_at timestamptz not null default now()
);

alter table public.assignments enable row level security;

drop policy if exists "Coaches can view their own assignments" on public.assignments;
create policy "Coaches can view their own assignments"
  on public.assignments for select
  using (auth.uid() = coach_id);

-- This checks four things before allowing an insert: you're the coach on
-- the assignment, your account is actually a coach, the account you're
-- assigning to is actually a client, and the workout is one of your own
-- (not another coach's) — that last one stops a coach handing out a
-- workout they didn't create.
drop policy if exists "Coaches can create assignments" on public.assignments;
create policy "Coaches can create assignments"
  on public.assignments for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
    and exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
    and exists (select 1 from public.workouts w where w.id = workout_id and w.coach_id = auth.uid())
  );

drop policy if exists "Coaches can update their own assignments" on public.assignments;
create policy "Coaches can update their own assignments"
  on public.assignments for update
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can delete their own assignments" on public.assignments;
create policy "Coaches can delete their own assignments"
  on public.assignments for delete
  using (auth.uid() = coach_id);

-- Coaches need to see client accounts to pick who to assign to. As things
-- stand, every coach can see every client account — there's no per-coach
-- client roster yet. Fine while you're testing; worth tightening before
-- real coaches and clients are both using this.
--
-- A policy on `profiles` can't safely query `profiles` directly inside
-- itself — Postgres has to re-run that table's policies to resolve the
-- subquery, which re-triggers this same policy, and so on forever
-- ("infinite recursion detected in policy for relation profiles"). The
-- fix is to do that lookup inside a SECURITY DEFINER function instead,
-- which runs with elevated privileges and skips that recursive check.
create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'coach'
  );
$$;

drop policy if exists "Coaches can view client profiles" on public.profiles;
create policy "Coaches can view client profiles"
  on public.profiles for select
  using (
    role = 'client'
    and public.is_coach()
  );
