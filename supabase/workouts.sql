-- Run this once in your Supabase project's SQL Editor, same way as before
-- (Dashboard > SQL Editor > New query > paste this whole file > Run).
-- This is additive to schema.sql — run it after that one, not instead of it.
--
-- It adds two tables:
--   workouts           one row per workout a coach creates (just a name)
--   workout_exercises  one row per exercise inside a workout (name + sets/reps
--                       text like "3x10"), linked to its workout
--
-- Row Level Security is set up so a coach can only ever see, create, edit,
-- or delete their OWN workouts and exercises — never another coach's.

-- 1. Workouts.
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.workouts enable row level security;

drop policy if exists "Coaches can view their own workouts" on public.workouts;
create policy "Coaches can view their own workouts"
  on public.workouts for select
  using (auth.uid() = coach_id);

-- The "and exists (...)" clause means only accounts whose profile role is
-- actually 'coach' can create a workout — a client account can't, even if
-- it somehow points coach_id at itself.
drop policy if exists "Coaches can create workouts" on public.workouts;
create policy "Coaches can create workouts"
  on public.workouts for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

drop policy if exists "Coaches can update their own workouts" on public.workouts;
create policy "Coaches can update their own workouts"
  on public.workouts for update
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can delete their own workouts" on public.workouts;
create policy "Coaches can delete their own workouts"
  on public.workouts for delete
  using (auth.uid() = coach_id);

-- 2. Exercises within a workout.
create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  name text not null,
  sets_reps text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.workout_exercises enable row level security;

-- These policies all check "does the workout this exercise belongs to
-- belong to me?" rather than checking the exercise row directly, since
-- there's no coach_id column on this table — only workout_id.
drop policy if exists "Coaches can view exercises in their workouts" on public.workout_exercises;
create policy "Coaches can view exercises in their workouts"
  on public.workout_exercises for select
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.coach_id = auth.uid()));

drop policy if exists "Coaches can add exercises to their workouts" on public.workout_exercises;
create policy "Coaches can add exercises to their workouts"
  on public.workout_exercises for insert
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.coach_id = auth.uid()));

drop policy if exists "Coaches can update exercises in their workouts" on public.workout_exercises;
create policy "Coaches can update exercises in their workouts"
  on public.workout_exercises for update
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.coach_id = auth.uid()));

drop policy if exists "Coaches can delete exercises in their workouts" on public.workout_exercises;
create policy "Coaches can delete exercises in their workouts"
  on public.workout_exercises for delete
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.coach_id = auth.uid()));
