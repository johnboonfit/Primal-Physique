-- Run this in the Supabase SQL Editor after weight-logs.sql (paste the
-- whole file, click Run).
--
-- Locks down how someone becomes a coach. Up to now, signup sent
-- whatever role the signup screen's toggle was set to, and the trigger
-- below trusted it — meaning anyone calling Supabase's signup API
-- directly (bypassing the app entirely) could set role: 'coach' and
-- grant themselves coach access to every client account. This removes
-- that trust: every new signup becomes a client, full stop, no matter
-- what role value is sent alongside it.
--
-- To make an account a coach going forward: have them sign up normally,
-- then in Supabase's Table Editor, open `profiles`, find their row, and
-- change `role` from 'client' to 'coach' by hand. That's the only way in.
--
-- This does not change any existing account's role — it only changes
-- what happens on future signups.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    new.email,
    'client',
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;
