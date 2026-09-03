-- Run this in the Supabase SQL Editor after exercise-swaps.sql.
--
-- Moves logging from one row per (assignment, exercise) to one row per
-- (assignment, exercise, SET) -- the live session screen logs each set
-- individually (weight, reps, and now RPE), not one summary number per
-- exercise for the whole thing.
--
-- Additive only: existing completed assignments' rows keep working
-- exactly as before (set_number and rpe are simply null on them, same
-- as every other "added later" column in this app).
--
-- The unique constraint is what makes the client's local-cache-then-
-- background-sync approach safe to retry: every set log write is an
-- upsert keyed on (assignment_id, exercise_id, set_number), so retrying
-- a push that actually succeeded the first time (but whose response the
-- client never saw, e.g. a dropped connection) just overwrites the same
-- row with the same values -- never a duplicate.

alter table public.workout_logs
  add column if not exists set_number int,
  add column if not exists rpe numeric check (rpe is null or (rpe >= 1 and rpe <= 10));

-- Safe to add even though existing rows all have set_number = null:
-- Postgres treats each null as distinct for uniqueness purposes, so this
-- doesn't conflict with any pre-existing data.
alter table public.workout_logs
  add constraint workout_logs_assignment_exercise_set_unique unique (assignment_id, exercise_id, set_number);

-- Needed for the upsert-based sync (insert ... on conflict do update)
-- and for unchecking a set (delete) -- workout_logs previously only had
-- select/insert policies, since the old one-shot logWorkout() never
-- needed to update or delete a row after writing it.
drop policy if exists "Clients can update their own workout logs" on public.workout_logs;
create policy "Clients can update their own workout logs"
  on public.workout_logs for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

drop policy if exists "Clients can delete their own workout logs" on public.workout_logs;
create policy "Clients can delete their own workout logs"
  on public.workout_logs for delete
  using (auth.uid() = client_id);
