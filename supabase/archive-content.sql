-- Run this in the Supabase SQL Editor after habits.sql, workouts.sql, and
-- programmes.sql (paste the whole file, click Run).
--
-- Adds a plain `archived boolean` column to habits, workouts, and
-- programme_blocks — nothing else changes shape-wise. This is deliberately
-- NOT a delete: every one of these three tables is a foreign-key parent
-- that other tables cascade-delete from (habit_logs off habits;
-- workout_exercises and assignments off workouts, with workout_logs
-- cascading again off both of those; programme_weeks off programme_blocks,
-- with workouts underneath cascading again off that). Actually deleting a
-- habit, workout, or programme a coach is done with would silently wipe
-- out every log and completed assignment that ever pointed at it — a
-- client's whole logged history for that item, gone the moment the coach
-- tidies up their list. Archiving just flips a flag: the row (and
-- everything built on top of it) stays exactly where it is, so every
-- historical read keeps working, and the only visible effect is that it
-- stops showing up in the lists a coach picks from when building something
-- new.
--
-- habits.sql never added an UPDATE policy at all (there was nothing to
-- update yet), so this file adds one — same shape as the existing
-- "Coaches can update their own workouts" / "...programmes" policies.
-- workouts and programme_blocks already have their own coach-scoped UPDATE
-- policies from workouts.sql and programmes.sql, so archiving through
-- those needs no new policy — setting `archived` is just an ordinary
-- column update, already covered by "auth.uid() = coach_id".

alter table public.habits add column if not exists archived boolean not null default false;
alter table public.workouts add column if not exists archived boolean not null default false;
alter table public.programme_blocks add column if not exists archived boolean not null default false;

drop policy if exists "Coaches can update their own habits" on public.habits;
create policy "Coaches can update their own habits"
  on public.habits for update
  using (auth.uid() = coach_id);
