-- Run this in the Supabase SQL Editor after feature-toggles.sql (paste
-- the whole file, click Run).
--
-- Two tables, coach-only reference data:
--
--   toggle_preset        a named bundle (Base/Accelerator/Precision
--                        plan defaults) -- 3 rows today, but a coach
--                        could have more bundles later.
--   toggle_preset_value  the actual (preset, feature) -> enabled
--                        matrix -- every preset defines all 9 features
--                        explicitly (unlike client_feature_toggles,
--                        where a missing row means "enabled," a preset
--                        has to be unambiguous about every feature it's
--                        bundling, or "apply this preset" wouldn't have
--                        a clear meaning for whichever keys it left out).
--
-- Values below come from the real plan-defaults matrix (Base/
-- Accelerator/Precision x all 9 feature keys), with one deliberate
-- override: Leaderboard is set to match Community's value for each tier
-- (off for Base, on for Accelerator/Precision) rather than the source
-- matrix's literal "on" for Base -- Leaderboards is a sub-tab inside
-- Community, and Leaderboard access is also independently gated by
-- client_tiers (Base doesn't qualify there either, see leaderboard.ts's
-- TIERS_WITH_LEADERBOARD_ACCESS) -- setting this toggle "on" for Base
-- would be a real value with no visible effect, since that separate
-- tier check would still block it.
--
-- AI Create Workout's Base default is "on" per the source matrix, with a
-- usage-limit caveat this boolean schema can't express ("one creation
-- per client, coach can reset") -- that's a real feature to build later,
-- not something a preset can enforce today; this just stores the on/off
-- half of it.

create table if not exists public.toggle_preset (
  key text primary key,
  label text not null
);

insert into public.toggle_preset (key, label) values
  ('base_defaults', 'Base Plan defaults'),
  ('accelerator_defaults', 'Accelerator defaults'),
  ('precision_defaults', 'Precision defaults')
on conflict (key) do nothing;

create table if not exists public.toggle_preset_value (
  preset_key text not null references public.toggle_preset (key) on delete cascade,
  feature_key text not null references public.feature_key (key) on delete cascade,
  enabled boolean not null,
  primary key (preset_key, feature_key)
);

insert into public.toggle_preset_value (preset_key, feature_key, enabled) values
  -- Base Plan defaults
  ('base_defaults', 'form_check', false),
  ('base_defaults', 'ai_create_workout', true),
  ('base_defaults', 'ai_assisted_logging', true),
  ('base_defaults', 'community', false),
  ('base_defaults', 'challenges', false),
  ('base_defaults', 'leaderboard', false),
  ('base_defaults', 'progress_photo_scanning', true),
  ('base_defaults', 'momentum_score', true),
  ('base_defaults', 'chat', false),
  -- Accelerator defaults
  ('accelerator_defaults', 'form_check', true),
  ('accelerator_defaults', 'ai_create_workout', false),
  ('accelerator_defaults', 'ai_assisted_logging', true),
  ('accelerator_defaults', 'community', true),
  ('accelerator_defaults', 'challenges', true),
  ('accelerator_defaults', 'leaderboard', true),
  ('accelerator_defaults', 'progress_photo_scanning', true),
  ('accelerator_defaults', 'momentum_score', true),
  ('accelerator_defaults', 'chat', true),
  -- Precision defaults
  ('precision_defaults', 'form_check', true),
  ('precision_defaults', 'ai_create_workout', true),
  ('precision_defaults', 'ai_assisted_logging', true),
  ('precision_defaults', 'community', true),
  ('precision_defaults', 'challenges', true),
  ('precision_defaults', 'leaderboard', true),
  ('precision_defaults', 'progress_photo_scanning', true),
  ('precision_defaults', 'momentum_score', true),
  ('precision_defaults', 'chat', true)
on conflict (preset_key, feature_key) do update set enabled = excluded.enabled;

alter table public.toggle_preset enable row level security;
alter table public.toggle_preset_value enable row level security;

drop policy if exists "Coaches can view toggle presets" on public.toggle_preset;
create policy "Coaches can view toggle presets"
  on public.toggle_preset for select
  using (public.is_coach());

drop policy if exists "Coaches can view toggle preset values" on public.toggle_preset_value;
create policy "Coaches can view toggle preset values"
  on public.toggle_preset_value for select
  using (public.is_coach());
