-- Run this in the Supabase SQL Editor after meal-plan-templates.sql.
--
-- Two additive capabilities for the Workout Builder (Phase 4), nothing
-- else about it changes:
--
--   1. workout_exercises gains two optional columns -- a coach-
--      recommended baseline weight and reps, used as a fallback when a
--      client logging a set has no previous session of their own to
--      pull numbers from.
--   2. A new workout_exercise_sets table lets a coach tag INDIVIDUAL
--      sets within an exercise with a training technique (Normal, Drop
--      Set, Rest-Pause, FST-7) -- separate from, and optional on top of,
--      the exercise's existing free-text "sets x reps" description. Most
--      exercises won't use this at all; it exists for the specific sets
--      where a coach wants to call out something other than a normal set.
--
-- The three special techniques' descriptions are NOT stored here, or
-- anywhere in the database -- they're a fixed, built-in constant in
-- src/lib/set-types.ts, the same "don't store what's actually a fixed
-- part of the app" reasoning already used for GOAL_TYPES and RECIPE_TAGS.
-- A coach only ever picks a type; the client-facing screen (a future
-- chunk) reads the matching description straight from that constant --
-- never something a coach has to write out per exercise.

alter table public.workout_exercises
  add column if not exists baseline_weight numeric check (baseline_weight >= 0),
  add column if not exists baseline_reps int check (baseline_reps > 0);

create table if not exists public.workout_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number int not null check (set_number > 0),
  set_type text not null default 'normal' check (set_type in ('normal', 'drop_set', 'rest_pause', 'fst7')),
  created_at timestamptz not null default now(),
  unique (exercise_id, set_number)
);

alter table public.workout_exercise_sets enable row level security;

-- Same "check the parent belongs to me" shape as workout_exercises' own
-- policies -- no coach_id column here directly, only exercise_id.
drop policy if exists "Coaches can view sets in their exercises" on public.workout_exercise_sets;
create policy "Coaches can view sets in their exercises"
  on public.workout_exercise_sets for select
  using (
    exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_id and w.coach_id = auth.uid()
    )
  );

drop policy if exists "Coaches can add sets to their exercises" on public.workout_exercise_sets;
create policy "Coaches can add sets to their exercises"
  on public.workout_exercise_sets for insert
  with check (
    exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_id and w.coach_id = auth.uid()
    )
  );

drop policy if exists "Coaches can update sets in their exercises" on public.workout_exercise_sets;
create policy "Coaches can update sets in their exercises"
  on public.workout_exercise_sets for update
  using (
    exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_id and w.coach_id = auth.uid()
    )
  );

drop policy if exists "Coaches can delete sets from their exercises" on public.workout_exercise_sets;
create policy "Coaches can delete sets from their exercises"
  on public.workout_exercise_sets for delete
  using (
    exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = exercise_id and w.coach_id = auth.uid()
    )
  );

-- Same client read-access shape client-access.sql already grants on
-- workout_exercises -- wired up now so this chunk's data is genuinely
-- queryable by a client screen the moment one exists, instead of this
-- file needing to be revisited later just to add reads.
drop policy if exists "Clients can view sets in workouts assigned to them" on public.workout_exercise_sets;
create policy "Clients can view sets in workouts assigned to them"
  on public.workout_exercise_sets for select
  using (
    exists (
      select 1 from public.workout_exercises we
      join public.assignments a on a.workout_id = we.workout_id
      where we.id = exercise_id and a.client_id = auth.uid()
    )
  );
