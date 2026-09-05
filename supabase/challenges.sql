-- Run this in the Supabase SQL Editor after community-leaderboards.sql
-- (paste the whole file, click Run).
--
-- Challenges, Phase A: creation and joining only — no progress
-- tracking, no scoring, no leaderboard yet. A challenge's `type`
-- (Volume or Consistency) is captured now so it's on the row from day
-- one, but nothing reads it yet; that's the natural next chunk once
-- this one is confirmed working.
--
-- Three tables:
--   1. challenges — the challenge itself (name, type, date range,
--      whether it's open to every client or a specific list).
--   2. challenge_eligible_clients — the specific-clients list, only
--      ever populated when challenges.open_to_all is false. Same
--      "snapshot the picks at creation time" shape
--      bulk_message_recipients (bulk-messages.sql) already uses.
--   3. challenge_participants — who has ACTUALLY joined, a genuinely
--      separate thing from who's merely eligible to. Joining/leaving
--      just inserts/deletes a row here; there is no "left" history —
--      leaving a challenge is undone cleanly, not soft-deleted.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type text not null check (type in ('volume', 'consistency')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  open_to_all boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

create table if not exists public.challenge_eligible_clients (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  primary key (challenge_id, client_id)
);

alter table public.challenge_eligible_clients enable row level security;

create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (challenge_id, client_id)
);

alter table public.challenge_participants enable row level security;

-- These three helpers exist for one reason: a plain inline subquery
-- from one of these tables' own RLS policies into ANOTHER of these
-- tables (e.g. challenges' client-select policy checking
-- challenge_eligible_clients, whose own policy checks challenges right
-- back) is a genuine infinite-recursion error in Postgres, not just a
-- style preference — the same reason is_coach()/is_client() are
-- SECURITY DEFINER rather than an inline profiles subquery. A SECURITY
-- DEFINER function's own internal queries run as the function's owner,
-- which bypasses RLS on the tables it reads, so calling one of these
-- from another table's policy never re-enters that table's own RLS
-- chain.

create or replace function public.owns_challenge(target_challenge_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = target_challenge_id and c.coach_id = auth.uid()
  );
$$;

create or replace function public.is_eligible_for_challenge(target_challenge_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = target_challenge_id
      and (
        c.open_to_all
        or exists (
          select 1 from public.challenge_eligible_clients e
          where e.challenge_id = c.id and e.client_id = auth.uid()
        )
      )
  );
$$;

-- Same eligibility check plus "hasn't already ended" — the real gate
-- on actually joining, not just seeing the challenge exists.
create or replace function public.can_join_challenge(target_challenge_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = target_challenge_id
      and c.end_date >= current_date
      and (
        c.open_to_all
        or exists (
          select 1 from public.challenge_eligible_clients e
          where e.challenge_id = c.id and e.client_id = auth.uid()
        )
      )
  );
$$;

drop policy if exists "Coach can manage their own challenges" on public.challenges;
create policy "Coach can manage their own challenges"
  on public.challenges for all
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

-- A client can see a challenge if it's open to everyone, or if they're
-- specifically listed as eligible for it — see is_eligible_for_challenge()
-- above for why this is a function call, not an inline subquery.
drop policy if exists "A client can view challenges they're eligible for" on public.challenges;
create policy "A client can view challenges they're eligible for"
  on public.challenges for select
  using (public.is_client() and public.is_eligible_for_challenge(id));

drop policy if exists "Coach can manage eligibility for their own challenges" on public.challenge_eligible_clients;
create policy "Coach can manage eligibility for their own challenges"
  on public.challenge_eligible_clients for all
  using (public.owns_challenge(challenge_id))
  with check (public.owns_challenge(challenge_id));

drop policy if exists "A client can see their own eligibility rows" on public.challenge_eligible_clients;
create policy "A client can see their own eligibility rows"
  on public.challenge_eligible_clients for select
  using (client_id = auth.uid());

drop policy if exists "A client can see their own participation" on public.challenge_participants;
create policy "A client can see their own participation"
  on public.challenge_participants for select
  using (client_id = auth.uid());

drop policy if exists "Coach can view participants of their own challenges" on public.challenge_participants;
create policy "Coach can view participants of their own challenges"
  on public.challenge_participants for select
  using (public.owns_challenge(challenge_id));

-- Joining is a real, enforced action, not just a UI button: a client
-- can only insert a participation row for THEMSELVES, and only for a
-- challenge that can_join_challenge() says yes to (hasn't ended, and
-- they're genuinely eligible) — the same two checks the client-facing
-- screen makes to decide whether to even show a Join button, enforced
-- again here so a stale screen or a hand-built request can't join
-- something it shouldn't.
drop policy if exists "A client can join a challenge they're eligible for" on public.challenge_participants;
create policy "A client can join a challenge they're eligible for"
  on public.challenge_participants for insert
  with check (client_id = auth.uid() and public.can_join_challenge(challenge_id));

-- Leaving has no date restriction — opting out should always work,
-- including for a challenge that's already ended.
drop policy if exists "A client can leave a challenge they joined" on public.challenge_participants;
create policy "A client can leave a challenge they joined"
  on public.challenge_participants for delete
  using (client_id = auth.uid());
