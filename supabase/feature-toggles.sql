-- Run this in the Supabase SQL Editor after client-activity-feed.sql
-- (paste the whole file, click Run).
--
-- Two tables:
--
--   feature_key             a real lookup table, not a hardcoded enum --
--                            adding a 10th gateable feature later is an
--                            insert here, never a schema migration.
--   client_feature_toggles  one row per (client, feature) a coach has
--                            EXPLICITLY set. No row for a given feature
--                            means "enabled" -- a coach only ever writes
--                            a row when actively turning something off
--                            for someone (or back on afterward), not 9
--                            rows created per client on day one.
--
-- Only 4 of these 9 keys are actually wired to a real gate right now
-- (see feature-toggles.ts / the retrofitted screens) -- Chat, Community,
-- Leaderboard, Momentum Score. The other 5 exist here so the coach-facing
-- toggle screen and this schema are ready the moment each feature is
-- actually built; toggling one of the other 5 today simply does nothing
-- yet, same as it would for a feature key nobody's added a gate for.

create table if not exists public.feature_key (
  key text primary key,
  label text not null
);

insert into public.feature_key (key, label) values
  ('form_check', 'Form Check'),
  ('ai_create_workout', 'AI Create Workout'),
  ('ai_assisted_logging', 'AI-Assisted Logging'),
  ('community', 'Community'),
  ('challenges', 'Challenges'),
  ('leaderboard', 'Leaderboard'),
  ('progress_photo_scanning', 'Progress Photo Scanning'),
  ('momentum_score', 'Momentum Score'),
  ('chat', 'Chat')
on conflict (key) do nothing;

create table if not exists public.client_feature_toggles (
  client_id uuid not null references public.profiles (id) on delete cascade,
  feature_key text not null references public.feature_key (key) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (client_id, feature_key)
);

alter table public.client_feature_toggles enable row level security;

drop policy if exists "Coaches can view any client's feature toggles" on public.client_feature_toggles;
create policy "Coaches can view any client's feature toggles"
  on public.client_feature_toggles for select
  using (public.is_coach());

drop policy if exists "Coaches can set any client's feature toggles" on public.client_feature_toggles;
create policy "Coaches can set any client's feature toggles"
  on public.client_feature_toggles for insert
  with check (public.is_coach());

drop policy if exists "Coaches can update any client's feature toggles" on public.client_feature_toggles;
create policy "Coaches can update any client's feature toggles"
  on public.client_feature_toggles for update
  using (public.is_coach());

drop policy if exists "Clients can view their own feature toggles" on public.client_feature_toggles;
create policy "Clients can view their own feature toggles"
  on public.client_feature_toggles for select
  using (auth.uid() = client_id);

-- feature_key itself is just a reference list -- readable by anyone
-- signed in (both the coach's toggle screen and, in principle, a client
-- screen could want the human-readable label), never written to by the
-- app itself.
alter table public.feature_key enable row level security;

drop policy if exists "Anyone signed in can view feature keys" on public.feature_key;
create policy "Anyone signed in can view feature keys"
  on public.feature_key for select
  using (auth.role() = 'authenticated');
