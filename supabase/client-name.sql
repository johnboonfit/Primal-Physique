-- Run this in the Supabase SQL Editor after coach-log-visibility.sql
-- (paste the whole file, click Run).
--
-- Adds a "full_name" column to profiles so the client's dashboard can
-- greet them by name, and updates the signup trigger to save it from
-- the name entered on the signup screen. Existing accounts created
-- before this will just have a blank full_name — the app falls back to
-- using their email in that case, so nothing breaks for them.

alter table public.profiles
  add column if not exists full_name text;

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
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;
