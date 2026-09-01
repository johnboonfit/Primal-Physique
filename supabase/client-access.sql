-- Run this in the Supabase SQL Editor after schema.sql, workouts.sql, and
-- assignments.sql (paste the whole file, click Run).
--
-- Gives clients read-only access to their OWN assignments, and to the
-- workout + exercises linked to each one — needed so a client's home
-- screen can show what's been assigned to them. Nothing here lets a
-- client see another client's data, or edit anything; select only.
--
-- None of these policies query their own table from inside themselves
-- (that's what caused the "infinite recursion" bug from the previous
-- chunk) — each one only looks at a different table, which is safe.

drop policy if exists "Clients can view their own assignments" on public.assignments;
create policy "Clients can view their own assignments"
  on public.assignments for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can view workouts assigned to them" on public.workouts;
create policy "Clients can view workouts assigned to them"
  on public.workouts for select
  using (
    exists (
      select 1 from public.assignments a
      where a.workout_id = workouts.id and a.client_id = auth.uid()
    )
  );

drop policy if exists "Clients can view exercises in workouts assigned to them" on public.workout_exercises;
create policy "Clients can view exercises in workouts assigned to them"
  on public.workout_exercises for select
  using (
    exists (
      select 1 from public.assignments a
      where a.workout_id = workout_exercises.workout_id and a.client_id = auth.uid()
    )
  );
