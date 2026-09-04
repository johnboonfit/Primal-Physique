-- Run this in the Supabase SQL Editor after onboarding.sql (paste the
-- whole file, click Run).
--
-- Completes onboarding without a coach lifting a finger: the instant a
-- client's PARQ is done and any health-advisory flag has been
-- acknowledged, they get auto-placed on the Base Plan (Tier 1 -- stored
-- as 'club', see leaderboard.ts) and the exact "Base Plan defaults"
-- toggle preset built in the Toggle Presets chunk, then land on Home.
-- There's no plan-choice screen and no payment step to skip here --
-- neither was ever built -- so "complete onboarding" just means:
-- apply the same tier + preset a coach would otherwise have had to set
-- by hand on the Clients list, automatically, the moment onboarding's
-- own gates (PARQ, and the health advisory if flagged) are satisfied.
--
-- Both client_tiers and client_feature_toggles are coach-only for
-- insert/update under RLS -- a client has never been allowed to set
-- their own tier or flip their own feature toggles, which is exactly
-- the access a client provisioning THEIR OWN account at signup needs.
-- So this is a SECURITY DEFINER function, the same controlled-bypass
-- pattern already used for leaderboards and the External Builder's
-- anonymous gateway -- scoped tightly to auth.uid(), so a client can
-- only ever provision their own account, never anyone else's.
--
-- onboarding_provisioned_at is what makes this safe to call as often as
-- the app wants (every onboarding-status check, every app open) without
-- ever re-running: the function does nothing at all once this is set,
-- so it can never silently undo a coach's later manual tier change or
-- toggle customization by re-applying the Base defaults on top of it.

alter table public.profiles
  add column if not exists onboarding_provisioned_at timestamptz;

create or replace function public.complete_client_onboarding()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_already_done timestamptz;
begin
  select onboarding_provisioned_at into v_already_done
  from public.profiles
  where id = v_client_id and role = 'client';

  if not found then
    return; -- caller isn't a real client profile -- nothing to provision
  end if;

  if v_already_done is not null then
    return; -- already provisioned once, ever -- never re-applies over a later manual change
  end if;

  insert into public.client_tiers (client_id, tier)
  values (v_client_id, 'club')
  on conflict (client_id) do nothing;

  insert into public.client_feature_toggles (client_id, feature_key, enabled)
  select v_client_id, feature_key, enabled
  from public.toggle_preset_value
  where preset_key = 'base_defaults'
  on conflict (client_id, feature_key) do nothing;

  update public.profiles set onboarding_provisioned_at = now() where id = v_client_id;
end;
$$;

grant execute on function public.complete_client_onboarding() to authenticated;
