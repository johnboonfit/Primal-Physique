-- Run this in the Supabase SQL Editor after schema.sql, workouts.sql,
-- assignments.sql, and client-access.sql (paste the whole file, click Run).
--
-- Adds:
--   - a "status" column on assignments ('pending' or 'completed')
--   - a "workout_logs" table storing what a client actually did (weight +
--     reps) for each exercise on an assignment
--   - permission for a client to flip their OWN assignment's status to
--     'completed' — previously only a coach could update an assignment
--     at all

alter table public.assignments
  add column if not exists status text not null default 'pending' check (status in ('pending', 'completed'));

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  weight numeric,
  reps integer,
  created_at timestamptz not null default now()
);

alter table public.workout_logs enable row level security;

drop policy if exists "Clients can view their own workout logs" on public.workout_logs;
create policy "Clients can view their own workout logs"
  on public.workout_logs for select
  using (auth.uid() = client_id);

-- Confirms the exercise actually belongs to the workout on this exact
-- assignment, and that the assignment is yours — stops logging against
-- someone else's assignment or an unrelated exercise.
drop policy if exists "Clients can log their own workouts" on public.workout_logs;
create policy "Clients can log their own workouts"
  on public.workout_logs for insert
  with check (
    auth.uid() = client_id
    and exists (
      select 1
      from public.assignments a
      join public.workouts w on w.id = a.workout_id
      join public.workout_exercises we on we.workout_id = w.id
      where a.id = assignment_id
        and we.id = exercise_id
        and a.client_id = auth.uid()
    )
  );

drop policy if exists "Clients can update their own assignment status" on public.assignments;
create policy "Clients can update their own assignment status"
  on public.assignments for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);
