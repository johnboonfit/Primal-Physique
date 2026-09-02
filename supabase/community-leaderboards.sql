-- Run this in the Supabase SQL Editor after community-moderation.sql.
--
-- Two things: a client_tiers table (which real membership tier each
-- client is on — Club, Accelerator, or Precision, matching your actual
-- Stripe products) and two SECURITY DEFINER functions that compute the
-- Leaderboard's weekly and lifetime XP rankings.
--
-- There's no live Stripe -> Supabase sync yet — that's real
-- infrastructure (a webhook, a customer-id mapping) well beyond this
-- chunk's scope. For now the coach sets each client's tier by hand to
-- match whatever they actually pay for, from a small control on the
-- Clients list. A client with no row here defaults to 'club' (the
-- lowest tier) — the same conservative "nothing set yet" default
-- community_blocks' absence-means-not-blocked already established,
-- just the opposite direction: absence here means the MOST
-- restricted tier, never accidentally the most permissive one.

-- 1. Tiers. Same reasoning as community_blocks: a
--    "profiles.tier" column would need a column-level UPDATE grant for
--    the COACH to set it, and granting that column to `authenticated`
--    at the table level would ALSO let a client set their own tier via
--    the existing "Users can update their own profile" row policy.
--    A dedicated table sidesteps that — insert/update are gated by
--    is_coach() alone.
create table if not exists public.client_tiers (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  tier text not null default 'club' check (tier in ('club', 'accelerator', 'precision')),
  updated_at timestamptz not null default now()
);

alter table public.client_tiers enable row level security;

drop policy if exists "A client can see their own tier" on public.client_tiers;
create policy "A client can see their own tier"
  on public.client_tiers for select
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view all tiers" on public.client_tiers;
create policy "Coaches can view all tiers"
  on public.client_tiers for select
  using (public.is_coach());

-- Same defense-in-depth shape assignments.sql and community_blocks
-- already use: not just "you're a coach," but "the id you're setting a
-- tier for actually belongs to a client account."
drop policy if exists "Coaches can set a client's tier" on public.client_tiers;
create policy "Coaches can set a client's tier"
  on public.client_tiers for insert
  with check (
    public.is_coach()
    and exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
  );

drop policy if exists "Coaches can update a client's tier" on public.client_tiers;
create policy "Coaches can update a client's tier"
  on public.client_tiers for update
  using (public.is_coach())
  with check (
    public.is_coach()
    and exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
  );

-- 2. Leaderboard rankings. SECURITY DEFINER so a single query can join
--    profiles + xp_events across every client at once (a plain SELECT
--    as a client would only ever see their own profile row otherwise —
--    there's still no "clients can view other clients' profiles"
--    policy, on purpose; the leaderboard doesn't need one when it can
--    read exactly the columns it needs through a narrow function
--    instead of opening the whole profiles table).
--
-- Weekly: sums the exact same xp_events ledger total_xp is itself kept
-- in sync from (via the trigger from xp.sql) — not a second scoring
-- system, just a date-filtered SUM over the one real source of truth.
create or replace function public.get_weekly_xp_leaderboard(week_start date, week_end date)
returns table (client_id uuid, full_name text, email text, xp bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, p.email, coalesce(sum(e.amount), 0)::bigint as xp
  from public.profiles p
  left join public.xp_events e
    on e.client_id = p.id and e.event_date between week_start and week_end
  where p.role = 'client'
  group by p.id, p.full_name, p.email
  order by xp desc, p.full_name asc nulls last;
$$;

-- Lifetime: reads profiles.total_xp directly — the exact same number
-- the Home dashboard's Level/XP card already shows for one client, just
-- for every client at once here.
create or replace function public.get_lifetime_xp_leaderboard()
returns table (client_id uuid, full_name text, email text, xp bigint)
language sql
security definer
set search_path = public
stable
as $$
  select id, full_name, email, total_xp::bigint as xp
  from public.profiles
  where role = 'client'
  order by total_xp desc, full_name asc nulls last;
$$;
