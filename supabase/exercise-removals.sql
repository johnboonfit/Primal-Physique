-- Run this in the Supabase SQL Editor after exercise-swaps.sql.
--
-- Lets a client remove an exercise from one specific session only
-- ("no cable machine free today") without ever touching
-- workout_exercises or the workout/programme it belongs to -- same
-- "purely additive, per-assignment" reasoning exercise-swaps.sql
-- documents for the identical problem (a workout_exercises row is
-- shared by reference across every assignment referencing it, so an
-- in-place edit would silently affect every other client/date too).
--
-- A removed exercise's slot still exists in workout_exercises and still
-- shows up on every OTHER assignment referencing that same workout --
-- this table only ever means "for THIS one assignment, THIS one
-- exercise slot was skipped." The app layer (getAssignmentDetail's
-- caller) filters a removed slot out of what's rendered/logged for this
-- session, the same way it overlays a swap's replacement today.

create table if not exists public.assignment_exercise_removals (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One removal per exercise slot per session -- re-removing an
  -- already-removed slot is a harmless no-op via upsert.
  unique (assignment_id, workout_exercise_id)
);

alter table public.assignment_exercise_removals enable row level security;

drop policy if exists "Clients can view their own exercise removals" on public.assignment_exercise_removals;
create policy "Clients can view their own exercise removals"
  on public.assignment_exercise_removals for select
  using (auth.uid() = client_id);

-- Single-coach-app treatment, same as assignment_exercise_swaps.
drop policy if exists "Coaches can view exercise removals" on public.assignment_exercise_removals;
create policy "Coaches can view exercise removals"
  on public.assignment_exercise_removals for select
  using (public.is_coach());

-- Confirms the exercise slot being removed actually belongs to the
-- assignment being claimed, and that assignment is really this
-- client's own -- identical shape to assignment_exercise_swaps' insert
-- policy.
drop policy if exists "Clients can remove exercises from their own sessions" on public.assignment_exercise_removals;
create policy "Clients can remove exercises from their own sessions"
  on public.assignment_exercise_removals for insert
  with check (
    auth.uid() = client_id
    and exists (
      select 1
      from public.assignments a
      join public.workouts w on w.id = a.workout_id
      join public.workout_exercises we on we.workout_id = w.id
      where a.id = assignment_id
        and we.id = workout_exercise_id
        and a.client_id = auth.uid()
    )
  );

-- Needed alongside insert so an upsert (re-removing an already-removed
-- slot) works under RLS.
drop policy if exists "Clients can change their own exercise removals" on public.assignment_exercise_removals;
create policy "Clients can change their own exercise removals"
  on public.assignment_exercise_removals for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- Lets a client undo a removal and bring the exercise back for this
-- session.
drop policy if exists "Clients can undo their own exercise removals" on public.assignment_exercise_removals;
create policy "Clients can undo their own exercise removals"
  on public.assignment_exercise_removals for delete
  using (auth.uid() = client_id);
