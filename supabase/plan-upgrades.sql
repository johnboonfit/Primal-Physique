-- Run this in the Supabase SQL Editor after activity-logs.sql (paste
-- the whole file, click Run).
--
-- A client tapping "Upgrade Plan" needs somewhere to record which tier
-- they picked BEFORE Stripe actually confirms the payment, and a way
-- for that confirmation (a webhook, which runs with no user session at
-- all) to write the result back. client_tiers itself still only ever
-- lets the COACH write it directly (see community-leaderboards.sql) --
-- that's deliberately unchanged here. This is a new, narrower table
-- just for tracking one upgrade attempt's lifecycle; the two Edge
-- Functions (create-checkout-session, stripe-webhook) are the only
-- things that ever move a row past 'pending', and both do it with the
-- service-role key, which bypasses RLS entirely -- so there's no
-- update policy for anyone below, on purpose.
create table if not exists public.plan_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  requested_tier text not null check (requested_tier in ('club', 'accelerator', 'precision')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.plan_upgrade_requests enable row level security;

drop policy if exists "Clients can view their own plan upgrade requests" on public.plan_upgrade_requests;
create policy "Clients can view their own plan upgrade requests"
  on public.plan_upgrade_requests for select
  using (auth.uid() = client_id);

-- Coach visibility isn't used by any screen yet this chunk, but there's
-- no reason a coach shouldn't be able to see a client's in-flight or
-- past upgrade attempts (same "coach can read everything client-shaped"
-- default every other per-client table in this app already follows) --
-- a coach-facing view can read this table later with no migration
-- needed.
drop policy if exists "Coaches can view every plan upgrade request" on public.plan_upgrade_requests;
create policy "Coaches can view every plan upgrade request"
  on public.plan_upgrade_requests for select
  using (public.is_coach());

drop policy if exists "Clients can start their own plan upgrade request" on public.plan_upgrade_requests;
create policy "Clients can start their own plan upgrade request"
  on public.plan_upgrade_requests for insert
  with check (auth.uid() = client_id and public.is_client() and status = 'pending');
