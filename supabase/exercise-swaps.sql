-- Run this in the Supabase SQL Editor after readiness.sql.
--
-- Lets a client swap an exercise for a same-muscle-group alternative,
-- for one specific session only ("the squat rack is taken today") --
-- without ever touching workout_exercises or the workout/programme it
-- belongs to.
--
-- Why this can't just update workout_exercises.name/exercise_library_id
-- directly: a workout row is shared by reference, not copied, across
-- every assignment that points at it (createAssignment just inserts
-- {workout_id, client_id, assigned_date} -- it doesn't duplicate the
-- workout or its exercises). The same "Push Day" workout_id, and the
-- same workout_exercises rows inside it, can be assigned to many
-- clients, or to the same client on many recurring dates. Editing
-- workout_exercises in place to "swap" one client's Tuesday session
-- would silently change the exercise for every other assignment
-- referencing that same row too -- every other client, every other
-- date, and the coach's original programme design. A brand new,
-- purely additive table sidesteps that entirely: it records "for THIS
-- one assignment, THIS one exercise slot was actually performed as a
-- different exercise," and nothing else ever reads or writes it.
--
-- workout_logs.exercise_id still points at the ORIGINAL
-- workout_exercises row regardless of a swap -- that's deliberate. The
-- workout_exercises row represents "slot #3 in this workout" as a
-- position, not a locked-in exercise; a swap changes what was actually
-- performed in that slot for one session, not which slot a log belongs
-- to. The app layer (getAssignmentDetail's caller) is what overlays a
-- swap's replacement name/exercise onto the display and the weight/reps
-- prefill logic.

create table if not exists public.assignment_exercise_swaps (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  replacement_exercise_library_id uuid not null references public.exercise_library (id) on delete cascade,
  -- Copied in at swap time, same reasoning as workout_exercises.name
  -- copying the library exercise's name at creation time -- the display
  -- name survives even if exercise_library's row is ever edited later.
  replacement_name text not null,
  created_at timestamptz not null default now(),
  -- One active swap per exercise slot per session -- swapping again
  -- (or swapping back and then to something else) replaces the earlier
  -- row via upsert rather than accumulating a history of them.
  unique (assignment_id, workout_exercise_id)
);

alter table public.assignment_exercise_swaps enable row level security;

drop policy if exists "Clients can view their own exercise swaps" on public.assignment_exercise_swaps;
create policy "Clients can view their own exercise swaps"
  on public.assignment_exercise_swaps for select
  using (auth.uid() = client_id);

-- Single-coach-app treatment, same as meal_plan_assignments and
-- readiness_responses -- any coach can see any client's swaps.
drop policy if exists "Coaches can view exercise swaps" on public.assignment_exercise_swaps;
create policy "Coaches can view exercise swaps"
  on public.assignment_exercise_swaps for select
  using (public.is_coach());

-- Confirms the exercise slot being swapped actually belongs to the
-- assignment being claimed, and that assignment is really this client's
-- own -- same "does this reference chain line up" shape workout_logs'
-- own insert policy already uses.
drop policy if exists "Clients can swap exercises in their own sessions" on public.assignment_exercise_swaps;
create policy "Clients can swap exercises in their own sessions"
  on public.assignment_exercise_swaps for insert
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

-- Needed alongside insert so an upsert (swapping an already-swapped
-- slot to something else) works under RLS.
drop policy if exists "Clients can change their own exercise swaps" on public.assignment_exercise_swaps;
create policy "Clients can change their own exercise swaps"
  on public.assignment_exercise_swaps for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- Lets a client undo a swap and go back to whatever the programme
-- originally prescribed.
drop policy if exists "Clients can undo their own exercise swaps" on public.assignment_exercise_swaps;
create policy "Clients can undo their own exercise swaps"
  on public.assignment_exercise_swaps for delete
  using (auth.uid() = client_id);
