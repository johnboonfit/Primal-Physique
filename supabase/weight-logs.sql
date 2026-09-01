-- Run this in the Supabase SQL Editor after food-logs.sql (paste the
-- whole file, click Run).
--
-- Adds a "weight_logs" table: one row per client per day. The
-- "unique (client_id, log_date)" rule is what makes logging today's
-- weight twice update the same row instead of creating a duplicate —
-- the app uses an "upsert" (insert, or update if that exact client+date
-- pair already exists) that only works cleanly because of this rule.

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  weight numeric not null,
  created_at timestamptz not null default now(),
  unique (client_id, log_date)
);

alter table public.weight_logs enable row level security;

drop policy if exists "Clients can view their own weight logs" on public.weight_logs;
create policy "Clients can view their own weight logs"
  on public.weight_logs for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can add their own weight logs" on public.weight_logs;
create policy "Clients can add their own weight logs"
  on public.weight_logs for insert
  with check (auth.uid() = client_id);

drop policy if exists "Clients can update their own weight logs" on public.weight_logs;
create policy "Clients can update their own weight logs"
  on public.weight_logs for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);
