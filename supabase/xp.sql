-- Run this in the Supabase SQL Editor after habits.sql (paste the whole
-- file, click Run).
--
-- Adds XP: a total_xp column on profiles, a ledger table (xp_events)
-- recording every award so it can be audited, and a trigger that keeps
-- the profile's running total in sync automatically whenever a new
-- event is logged.
--
-- Also fixes a real gap this exposed: the original "Users can update
-- their own profile" rule (from the very first setup script) let a
-- client update ANY column on their own profile row — including role.
-- That means, up to now, a client could have called Supabase's update
-- API directly and set their own role to 'coach', completely
-- bypassing the signup lockdown from a few chunks ago. It would also
-- have let them set total_xp to anything they liked. This tightens
-- that down so a client can only ever change their own full_name —
-- the one field they should legitimately be able to edit on
-- themselves.

alter table public.profiles
  add column if not exists total_xp integer not null default 0;

-- Column-level lockdown: row-level security decides WHICH ROW you can
-- touch; this decides WHICH COLUMNS. Together, a client can now only
-- ever change their own full_name — never role, never total_xp.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null check (reason in ('workout_completed', 'meal_logged', 'habit_completed', 'active_day_bonus')),
  event_date date not null,
  assignment_id uuid references public.assignments (id) on delete cascade,
  habit_id uuid references public.habits (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- These are what actually prevent double-awarding, enforced by the
-- database itself rather than trusted to app code: one workout session
-- can only ever appear once, one meal-logged award per client per day,
-- one habit award per habit per day, one bonus per client per day.
create unique index if not exists xp_events_workout_once
  on public.xp_events (assignment_id) where reason = 'workout_completed';

create unique index if not exists xp_events_meal_once_per_day
  on public.xp_events (client_id, event_date) where reason = 'meal_logged';

create unique index if not exists xp_events_habit_once_per_day
  on public.xp_events (habit_id, event_date) where reason = 'habit_completed';

create unique index if not exists xp_events_active_bonus_once_per_day
  on public.xp_events (client_id, event_date) where reason = 'active_day_bonus';

alter table public.xp_events enable row level security;

drop policy if exists "Clients can view their own xp events" on public.xp_events;
create policy "Clients can view their own xp events"
  on public.xp_events for select
  using (auth.uid() = client_id);

-- The important one: it hard-codes the exact XP amount allowed for
-- each reason, confirms a workout/habit award points at a real record
-- you own (and, for workouts, one that's actually marked completed),
-- and confirms the active-day bonus only goes through if all three
-- other categories are already logged for that exact day. A client
-- calling the API directly, skipping the app entirely, can't grant
-- themselves XP they didn't earn.
drop policy if exists "Clients can log their own xp" on public.xp_events;
create policy "Clients can log their own xp"
  on public.xp_events for insert
  with check (
    auth.uid() = client_id
    and (
      (
        reason = 'workout_completed' and amount = 50 and assignment_id is not null
        and exists (
          select 1 from public.assignments a
          where a.id = assignment_id and a.client_id = auth.uid() and a.status = 'completed'
        )
      )
      or (reason = 'meal_logged' and amount = 10)
      or (
        reason = 'habit_completed' and amount = 5 and habit_id is not null
        and exists (select 1 from public.habits h where h.id = habit_id and h.client_id = auth.uid())
      )
      or (
        reason = 'active_day_bonus' and amount = 15
        and exists (
          select 1 from public.xp_events e
          where e.client_id = auth.uid() and e.event_date = xp_events.event_date and e.reason = 'workout_completed'
        )
        and exists (
          select 1 from public.xp_events e
          where e.client_id = auth.uid() and e.event_date = xp_events.event_date and e.reason = 'meal_logged'
        )
        and exists (
          select 1 from public.xp_events e
          where e.client_id = auth.uid() and e.event_date = xp_events.event_date and e.reason = 'habit_completed'
        )
      )
    )
  );

-- Keeps profiles.total_xp automatically in sync — every successful
-- insert into xp_events adds its amount to that client's running
-- total. This runs regardless of which app screen triggered the
-- insert, so the total can never drift out of sync with the ledger.
create or replace function public.apply_xp_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set total_xp = total_xp + new.amount
  where id = new.client_id;
  return new;
end;
$$;

drop trigger if exists on_xp_event_insert on public.xp_events;
create trigger on_xp_event_insert
  after insert on public.xp_events
  for each row execute procedure public.apply_xp_event();
