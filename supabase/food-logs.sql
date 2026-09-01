-- Run this in the Supabase SQL Editor after client-name.sql (paste the
-- whole file, click Run).
--
-- Adds a "food_logs" table: one row per food entry a client adds under a
-- meal, on a given date. Locked down so a client can only see and add
-- their own entries — nobody else's, including their coach.

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snacks')),
  food_name text not null,
  calories integer not null,
  created_at timestamptz not null default now()
);

alter table public.food_logs enable row level security;

drop policy if exists "Clients can view their own food logs" on public.food_logs;
create policy "Clients can view their own food logs"
  on public.food_logs for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can add their own food logs" on public.food_logs;
create policy "Clients can add their own food logs"
  on public.food_logs for insert
  with check (auth.uid() = client_id);
