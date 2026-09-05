-- Run this in the Supabase SQL Editor after custom-exercises.sql (paste
-- the whole file, click Run).
--
-- A brand-new table: a client logging a cardio/conditioning activity
-- (run, swim, bike, walk, row, pilates, stairmaster, a generic
-- "activity", or a free-typed custom one) that isn't part of a
-- prescribed workout -- there was nowhere to record this at all before
-- now. Feeds the coach's cross-client Activity feed (client-activity-
-- feed.sql's pattern, extended here) and a small bonus in the client's
-- Momentum Score (see momentum.ts).
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  activity_type text not null check (activity_type in ('run', 'swim', 'bike', 'walk', 'row', 'pilates', 'stairmaster', 'activity', 'custom')),
  -- Only set (and only meaningful) when activity_type = 'custom' -- the
  -- client's own typed-in name for an activity that isn't one of the
  -- eight fixed types.
  custom_label text,
  duration_minutes integer not null check (duration_minutes > 0),
  distance numeric,
  distance_unit text check (distance_unit in ('km', 'mi')),
  calories integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

drop policy if exists "Clients can view their own activity logs" on public.activity_logs;
create policy "Clients can view their own activity logs"
  on public.activity_logs for select
  using (auth.uid() = client_id);

-- Same shape client-activity-feed.sql already added for habit_logs -- the
-- coach's Activity feed needs to read every client's rows, not just their
-- own.
drop policy if exists "Coaches can view their clients' activity logs" on public.activity_logs;
create policy "Coaches can view their clients' activity logs"
  on public.activity_logs for select
  using (public.is_coach());

drop policy if exists "Clients can log their own activities" on public.activity_logs;
create policy "Clients can log their own activities"
  on public.activity_logs for insert
  with check (auth.uid() = client_id and public.is_client());

-- Delete only -- same as weight_logs/food_logs, a client can remove a
-- mis-logged entry outright; editing one isn't a need this chunk asked
-- for (unlike food_logs' quantity edit), so there's no update policy.
drop policy if exists "Clients can delete their own activity logs" on public.activity_logs;
create policy "Clients can delete their own activity logs"
  on public.activity_logs for delete
  using (auth.uid() = client_id);

alter publication supabase_realtime add table public.activity_logs;
