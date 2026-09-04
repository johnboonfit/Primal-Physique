-- Run this in the Supabase SQL Editor after saved-meals.sql (paste the
-- whole file, click Run).
--
-- The landing zone for real wearable data (Apple Health first, Google
-- Health/Health Connect next, Fitbit/Garmin/Whoop later) -- this
-- migration only adds the tables and permissions. Nothing in the app
-- writes to these yet: HealthKit and Health Connect are native-only
-- APIs with no equivalent in Expo Go or a browser, so actually reading
-- from them needs a custom EAS dev-client build, platform entitlements,
-- and a real device to grant permissions on -- a separate project once
-- that native build exists. Until then, every read of these tables
-- comes back empty, and the app's existing "Sync a wearable" / "Not
-- connected" placeholders (client Home's Steps ring, the workout
-- logger's Heart Rate row, Settings' Wearable card) stay exactly as
-- honest as they are today -- this just makes them read from a real
-- (currently always-empty) query instead of a hardcoded string, so the
-- moment real data lands here, they start showing it with no further
-- UI changes needed.
--
-- wearable_connections        one row per (client, provider) the client
--                             has ever connected -- connected_at/
--                             last_synced_at, nothing else; the actual
--                             OAuth/permission handshake lives entirely
--                             in the native layer once it exists
-- wearable_daily_metrics      one row per (client, day) -- steps,
--                             resting heart rate, active calories,
--                             sleep, all nullable (a sync may only ever
--                             have some of these available)
-- wearable_heart_rate_samples timestamped individual readings, not
--                             rolled up per day -- lets the workout
--                             logger show something closer to "current"
--                             heart rate (the most recent sample within
--                             a short freshness window) rather than
--                             just a daily average

create table if not exists public.wearable_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('apple_health', 'google_health')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (client_id, provider)
);

alter table public.wearable_connections enable row level security;

drop policy if exists "Clients can view their own wearable connections" on public.wearable_connections;
create policy "Clients can view their own wearable connections"
  on public.wearable_connections for select
  using (auth.uid() = client_id);

-- Single-coach-app treatment, same as food_logs/weight_logs/readiness_responses
-- -- a coach can see any client's real health data, there's no per-
-- coach scoping anywhere else in this schema either.
drop policy if exists "Coaches can view client wearable connections" on public.wearable_connections;
create policy "Coaches can view client wearable connections"
  on public.wearable_connections for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "Clients can manage their own wearable connections" on public.wearable_connections;
create policy "Clients can manage their own wearable connections"
  on public.wearable_connections for insert
  with check (auth.uid() = client_id);

drop policy if exists "Clients can update their own wearable connections" on public.wearable_connections;
create policy "Clients can update their own wearable connections"
  on public.wearable_connections for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

drop policy if exists "Clients can remove their own wearable connections" on public.wearable_connections;
create policy "Clients can remove their own wearable connections"
  on public.wearable_connections for delete
  using (auth.uid() = client_id);

create table if not exists public.wearable_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  metric_date date not null,
  steps int,
  resting_heart_rate int,
  active_calories int,
  sleep_minutes int,
  source text not null check (source in ('apple_health', 'google_health')),
  synced_at timestamptz not null default now(),
  unique (client_id, metric_date)
);

alter table public.wearable_daily_metrics enable row level security;

drop policy if exists "Clients can view their own wearable daily metrics" on public.wearable_daily_metrics;
create policy "Clients can view their own wearable daily metrics"
  on public.wearable_daily_metrics for select
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view client wearable daily metrics" on public.wearable_daily_metrics;
create policy "Coaches can view client wearable daily metrics"
  on public.wearable_daily_metrics for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "Clients can save their own wearable daily metrics" on public.wearable_daily_metrics;
create policy "Clients can save their own wearable daily metrics"
  on public.wearable_daily_metrics for insert
  with check (auth.uid() = client_id);

drop policy if exists "Clients can update their own wearable daily metrics" on public.wearable_daily_metrics;
create policy "Clients can update their own wearable daily metrics"
  on public.wearable_daily_metrics for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

create table if not exists public.wearable_heart_rate_samples (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  recorded_at timestamptz not null,
  bpm int not null check (bpm > 0),
  source text not null check (source in ('apple_health', 'google_health'))
);

-- Read pattern is always "this client's most recent sample" -- unlike
-- the other two tables here, this one could see a real row every few
-- minutes once synced, so it gets an index the others don't need yet.
create index if not exists wearable_heart_rate_samples_client_recorded_idx
  on public.wearable_heart_rate_samples (client_id, recorded_at desc);

alter table public.wearable_heart_rate_samples enable row level security;

drop policy if exists "Clients can view their own heart rate samples" on public.wearable_heart_rate_samples;
create policy "Clients can view their own heart rate samples"
  on public.wearable_heart_rate_samples for select
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view client heart rate samples" on public.wearable_heart_rate_samples;
create policy "Coaches can view client heart rate samples"
  on public.wearable_heart_rate_samples for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "Clients can save their own heart rate samples" on public.wearable_heart_rate_samples;
create policy "Clients can save their own heart rate samples"
  on public.wearable_heart_rate_samples for insert
  with check (auth.uid() = client_id);
