-- Run this in the Supabase SQL Editor after challenges.sql.
--
-- Challenges, Phase B: make a joined challenge actually mean something.
-- A challenge's `type` (Volume or Consistency) was captured back in
-- challenges.sql but nothing read it yet — this is that read. One new
-- function, get_challenge_leaderboard(), computes every participant's
-- real progress straight from workout_logs/assignments (the exact same
-- tables Training's Volume Analyser and the live session screen's own
-- PB tracking already read from — not a second scoring system) and
-- ranks them.
--
-- Nothing here needs a new "locked" column or a cutover job: a
-- challenge's end_date is already the hard boundary the function
-- filters by, so a set logged after a challenge ends simply falls
-- outside its window and never counts — the challenge locks itself, by
-- construction, the same instant its own date range says it's over.

-- Realtime delivery for live standings needs workout_logs actually
-- broadcasting changes — it wasn't added to the publication before now
-- since nothing needed it live until this chunk. challenge_participants
-- goes in too, so a leaderboard already open updates the instant
-- someone else joins or leaves, not just when an existing participant
-- logs a set.
alter publication supabase_realtime add table public.workout_logs;
alter publication supabase_realtime add table public.challenge_participants;

-- SECURITY DEFINER for the same reason get_weekly_xp_leaderboard is —
-- ranking every participant means reading across clients, which a plain
-- client-side query can't do under RLS (workout_logs and assignments are
-- both "your own rows only"). The permission check below is the real
-- gate, since a SECURITY DEFINER function bypasses RLS entirely on what
-- it reads internally: only the challenge's own coach, or a client who
-- could already see the challenge exists in the first place (open to
-- all, or specifically listed — the exact same is_eligible_for_challenge()
-- check challenges.sql's own client-select policy uses), gets any rows
-- back at all. Everyone else gets zero rows, not an error.
--
-- Volume: sums weight x reps across every set logged against an
-- assignment whose assigned_date falls inside the challenge's own
-- [start_date, end_date] window — the same "scope sets by assignment
-- date, not log timestamp" join muscle-group-analysis.ts already uses
-- for "this week's" sets, just with the challenge's own window instead
-- of a calendar week.
--
-- Consistency: counts distinct assignments with status = 'completed' in
-- that same window — a real completed session, not just one that was
-- merely assigned.
--
-- Every participant appears even with zero progress (the left joins
-- guarantee that): a client who joined but hasn't logged anything yet
-- still shows up, at the bottom, exactly as they should.
create or replace function public.get_challenge_leaderboard(target_challenge_id uuid)
returns table (client_id uuid, full_name text, email text, progress numeric)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.full_name,
    p.email,
    case
      when c.type = 'volume' then coalesce(sum(wl.weight * wl.reps), 0)
      else count(distinct case when a.status = 'completed' then a.id end)::numeric
    end as progress
  from public.challenges c
  join public.challenge_participants cp on cp.challenge_id = c.id
  join public.profiles p on p.id = cp.client_id
  left join public.assignments a
    on a.client_id = p.id and a.assigned_date between c.start_date and c.end_date
  left join public.workout_logs wl on wl.assignment_id = a.id
  where c.id = target_challenge_id
    and (public.owns_challenge(target_challenge_id) or public.is_eligible_for_challenge(target_challenge_id))
  group by p.id, p.full_name, p.email, c.type
  order by progress desc, p.full_name asc nulls last;
$$;
