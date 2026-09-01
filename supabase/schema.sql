-- Run this once in your Supabase project's SQL Editor
-- (Dashboard > SQL Editor > New query > paste this whole file > Run).
--
-- It sets up a "profiles" table that stores each user's role (coach or
-- client), locks it down so people can only see their own row, and wires
-- up a trigger so a profile row is created automatically the moment
-- someone signs up.

-- 1. The profiles table itself.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('coach', 'client')),
  created_at timestamptz not null default now()
);

-- 2. Row Level Security: off by default means "no access at all" once
--    enabled, so we add policies that let a user read/update only their
--    own row.
alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Whenever a new row appears in Supabase's built-in auth.users table
--    (i.e. someone signs up), automatically create a matching profiles row.
--    The role comes from the metadata the app sends with signUp() — see
--    src/app/(auth)/signup.tsx. Defaults to 'client' if it's ever missing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
