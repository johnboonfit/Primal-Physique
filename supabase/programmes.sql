-- Run this in the Supabase SQL Editor after reschedule.sql (paste the
-- whole file, click Run).
--
-- Adds multi-week programmes, sitting on top of the existing workout
-- system rather than replacing it:
--
--   programme_blocks   one row per programme a coach builds (name,
--                       description, cover image, goal type, how many
--                       weeks it runs, which days of the week it trains)
--   programme_weeks     one row per week inside a programme (just a week
--                        number) — created automatically for every week
--                        in the programme's duration
--
-- Then workouts gets one new, optional column: programme_week_id. A
-- workout can now belong to a specific week of a specific programme, but
-- it doesn't have to — leaving it null is exactly the old behaviour, so
-- the standalone single-workout flow from before keeps working untouched.
--
-- This chunk is creation only: a coach can build out a programme's weeks
-- and sessions. Assigning a whole programme to a client is next.

create table if not exists public.programme_blocks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  cover_image_url text,
  goal_type text not null check (goal_type in ('cutting', 'bulking', 'recomp', 'strength')),
  duration_weeks int not null check (duration_weeks > 0 and duration_weeks <= 52),
  -- A weekly template ("trains Mon/Wed/Fri"), not actual calendar dates —
  -- those only get decided when a programme is assigned to a client.
  scheduled_days text[] not null default '{}'::text[]
    check (scheduled_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]),
  created_at timestamptz not null default now()
);

alter table public.programme_blocks enable row level security;

drop policy if exists "Coaches can view their own programmes" on public.programme_blocks;
create policy "Coaches can view their own programmes"
  on public.programme_blocks for select
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can create programmes" on public.programme_blocks;
create policy "Coaches can create programmes"
  on public.programme_blocks for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

drop policy if exists "Coaches can update their own programmes" on public.programme_blocks;
create policy "Coaches can update their own programmes"
  on public.programme_blocks for update
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can delete their own programmes" on public.programme_blocks;
create policy "Coaches can delete their own programmes"
  on public.programme_blocks for delete
  using (auth.uid() = coach_id);

create table if not exists public.programme_weeks (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programme_blocks (id) on delete cascade,
  week_number int not null check (week_number > 0),
  created_at timestamptz not null default now(),
  unique (programme_id, week_number)
);

alter table public.programme_weeks enable row level security;

-- Same "check the parent belongs to me" shape as workout_exercises —
-- there's no coach_id column here directly, only programme_id.
drop policy if exists "Coaches can view weeks in their programmes" on public.programme_weeks;
create policy "Coaches can view weeks in their programmes"
  on public.programme_weeks for select
  using (exists (select 1 from public.programme_blocks pb where pb.id = programme_id and pb.coach_id = auth.uid()));

drop policy if exists "Coaches can add weeks to their programmes" on public.programme_weeks;
create policy "Coaches can add weeks to their programmes"
  on public.programme_weeks for insert
  with check (exists (select 1 from public.programme_blocks pb where pb.id = programme_id and pb.coach_id = auth.uid()));

drop policy if exists "Coaches can delete weeks in their programmes" on public.programme_weeks;
create policy "Coaches can delete weeks in their programmes"
  on public.programme_weeks for delete
  using (exists (select 1 from public.programme_blocks pb where pb.id = programme_id and pb.coach_id = auth.uid()));

alter table public.workouts
  add column if not exists programme_week_id uuid references public.programme_weeks (id) on delete cascade;

-- Re-creates the two policies workouts.sql set up, adding one more
-- condition: if a workout does point at a programme week, that week's
-- programme has to actually belong to you. Without this, a coach could
-- take a workout they own and, via a direct API call, link it into
-- another coach's programme — the workout itself would still be theirs,
-- but it'd be showing up inside someone else's programme structure.
drop policy if exists "Coaches can create workouts" on public.workouts;
create policy "Coaches can create workouts"
  on public.workouts for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
    and (
      programme_week_id is null
      or exists (
        select 1 from public.programme_weeks pw
        join public.programme_blocks pb on pb.id = pw.programme_id
        where pw.id = programme_week_id and pb.coach_id = auth.uid()
      )
    )
  );

drop policy if exists "Coaches can update their own workouts" on public.workouts;
create policy "Coaches can update their own workouts"
  on public.workouts for update
  using (auth.uid() = coach_id)
  with check (
    auth.uid() = coach_id
    and (
      programme_week_id is null
      or exists (
        select 1 from public.programme_weeks pw
        join public.programme_blocks pb on pb.id = pw.programme_id
        where pw.id = programme_week_id and pb.coach_id = auth.uid()
      )
    )
  );
