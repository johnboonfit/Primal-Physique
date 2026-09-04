-- Run this in the Supabase SQL Editor after onboarding-auto-provision.sql
-- (paste the whole file, click Run).
--
-- Two things for the new Settings screen's Profile settings card:
--
--   1. profiles.phone_number -- new self-editable column, same
--      column-level-grant pattern every other self-editable profile
--      field already uses (full_name, community_hidden, last_seen_at,
--      etc.) -- RLS alone ("update your own row") isn't the only gate
--      in this schema; a column has to be explicitly granted too, or a
--      client could otherwise write ANY column on their own row
--      (including role) through the same "own row" policy.
--
--   2. Keeping profiles.email in sync with a REAL email change. Email
--      itself is deliberately NOT made self-editable here the same way
--      name/phone are -- changing a login email goes through Supabase
--      Auth's own updateUser({ email }) call from the app (a
--      confirmation link to the new address, not an instant change),
--      which updates auth.users.email once confirmed. Until now nothing
--      kept profiles.email in sync with that -- handle_new_user() only
--      ever ran once, at signup. Without this trigger, a confirmed
--      email change would update the real login email but leave the
--      profiles row (and everything reading it, like this Settings
--      screen) silently showing the old one forever.

alter table public.profiles
  add column if not exists phone_number text;

grant update (phone_number) on public.profiles to authenticated;

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
