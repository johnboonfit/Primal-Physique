-- Run this in the Supabase SQL Editor after weight-trend.sql (order
-- relative to the other food_logs/weight_logs files doesn't matter — this
-- one only adds a new table).
--
-- Adds a "tdee_estimates" table: one row per client per calculation date,
-- holding the Adaptive TDEE estimate for that day's trailing 14-day
-- window. Recomputed and upserted fresh each time the app runs the
-- calculation (see src/lib/tdee.ts) — it's a rolling estimate, not a
-- one-time value, so a new calculation for a date that already has a row
-- replaces it rather than creating a duplicate.
--
-- The inputs that produced the estimate (avg_daily_intake,
-- weight_change_kg, implied_daily_balance) are stored alongside the
-- final number purely so a coach (or this app's own tests) can see how
-- an estimate was derived without re-deriving it by hand.
--
-- Note on units: weight_logs/weight_trend are tracked in kg, matching the
-- 7700 kcal/kg constant this formula uses — no unit conversion involved.

create table if not exists public.tdee_estimates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  calculated_date date not null,
  window_days integer not null,
  avg_daily_intake numeric not null,
  weight_change_kg numeric not null,
  implied_daily_balance numeric not null,
  estimated_tdee numeric not null,
  created_at timestamptz not null default now(),
  unique (client_id, calculated_date)
);

alter table public.tdee_estimates enable row level security;

drop policy if exists "Clients can view their own TDEE estimates" on public.tdee_estimates;
create policy "Clients can view their own TDEE estimates"
  on public.tdee_estimates for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can add their own TDEE estimates" on public.tdee_estimates;
create policy "Clients can add their own TDEE estimates"
  on public.tdee_estimates for insert
  with check (auth.uid() = client_id);

drop policy if exists "Clients can update their own TDEE estimates" on public.tdee_estimates;
create policy "Clients can update their own TDEE estimates"
  on public.tdee_estimates for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);
