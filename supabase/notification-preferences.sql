-- Run this in the Supabase SQL Editor after settings-profile.sql (paste
-- the whole file, click Run).
--
-- Four preference columns on profiles for the Settings screen's new
-- Notification toggles card. This is preference STORAGE ONLY -- no real
-- notification delivery exists yet anywhere in this app (that's Phase
-- 14), so nothing reads these columns yet either. They exist now so
-- that when delivery is built, whatever a client already chose is
-- sitting there correctly, rather than delivery shipping with
-- everyone silently defaulted to whatever the code happens to assume.
--
-- All four default to true ("on unless someone turns it off") -- the
-- same convention this schema already uses everywhere else a missing
-- preference should mean "enabled" (client_feature_toggles' "no row
-- means enabled", for instance) rather than everyone being silently
-- opted out until they visit a settings screen they don't know exists
-- yet.
--
-- Same column-level-grant pattern every other self-editable profile
-- field already uses (full_name, phone_number, community_hidden,
-- etc.) -- RLS's "update your own row" policy isn't the only gate in
-- this schema; each column also needs its own explicit grant.

alter table public.profiles
  add column if not exists push_notifications_enabled boolean not null default true,
  add column if not exists workout_reminders_enabled boolean not null default true,
  add column if not exists habit_reminders_enabled boolean not null default true,
  add column if not exists community_updates_enabled boolean not null default true;

grant update (
  push_notifications_enabled,
  workout_reminders_enabled,
  habit_reminders_enabled,
  community_updates_enabled
) on public.profiles to authenticated;
