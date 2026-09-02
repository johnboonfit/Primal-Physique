-- Run this in the Supabase SQL Editor after body-metrics.sql.
--
-- Adds a "body_measurements" table: one row per client, per date, per
-- measurement type (waist, chest, arms, thighs, hips, neck). Unlike
-- weight, there's no smoothing here — no weight_trend equivalent, no
-- EWMA, just the raw number the client typed in, plotted as-is.
--
-- Storing one type per row (rather than six columns on one row, the way
-- weight/body-fat/muscle share weight_logs) is deliberate: a client
-- rarely measures everything on the same day, and this way logging just
-- a waist measurement doesn't force a decision about what to do with
-- five other blank fields on the same row. The
-- "(client_id, log_date, measurement_type)" uniqueness rule means
-- logging waist and chest the same day are two independent rows, but
-- logging waist twice the same day updates the one row instead of
-- duplicating it — same upsert pattern as weight_logs.
--
-- Units: stored in centimetres (value_cm), matching the kg convention
-- weight already uses in this app.

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  measurement_type text not null check (measurement_type in ('waist', 'chest', 'arms', 'thighs', 'hips', 'neck')),
  value_cm numeric not null check (value_cm > 0),
  created_at timestamptz not null default now(),
  unique (client_id, log_date, measurement_type)
);

alter table public.body_measurements enable row level security;

drop policy if exists "Clients can view their own body measurements" on public.body_measurements;
create policy "Clients can view their own body measurements"
  on public.body_measurements for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can add their own body measurements" on public.body_measurements;
create policy "Clients can add their own body measurements"
  on public.body_measurements for insert
  with check (auth.uid() = client_id);

drop policy if exists "Clients can update their own body measurements" on public.body_measurements;
create policy "Clients can update their own body measurements"
  on public.body_measurements for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);
