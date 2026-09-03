-- Run this in the Supabase SQL Editor after session-rpe.sql (paste the
-- whole file, click Run).
--
-- Adds a `status` field to profiles ('active' | 'paused') so a coach can
-- pause a client from the Clients screen. Pausing touches nothing about
-- the client's own data -- no workouts, logs, or history are archived,
-- deleted, or hidden from them. It only changes how that client counts
-- and appears on the coach's own dashboard/roster (see clients.ts and
-- coach-dashboard.ts). Reactivating is the exact same action in
-- reverse, at any time.
--
-- Column-level grant + a real gap it would otherwise open: `profiles`
-- was already locked down (see lock-coach-role.sql / xp.sql) so
-- `authenticated` can only ever touch a short allow-list of columns,
-- one grant per file. Granting `update (status)` broadly is required
-- for a COACH to be able to set it on a CLIENT's row -- but Postgres
-- column grants apply to the whole `authenticated` role, not to "just
-- coaches," so on their own they'd also let a client flip their OWN
-- status via a direct API call (the existing "Users can update their
-- own profile" row policy already lets a client touch their own row;
-- this would just add one more column to what it can touch). The
-- trigger below closes that: any actual change to `status` is rejected
-- unless the person making it is a coach, regardless of which row
-- policy let the UPDATE statement through in the first place.

alter table public.profiles
  add column if not exists status text not null default 'active' check (status in ('active', 'paused'));

grant update (status) on public.profiles to authenticated;

drop policy if exists "Coaches can update client status" on public.profiles;
create policy "Coaches can update client status"
  on public.profiles for update
  using (
    role = 'client'
    and public.is_coach()
  );

create or replace function public.enforce_status_change_by_coach()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and not public.is_coach() then
    raise exception 'Only a coach can change a client''s status.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_status_change_by_coach on public.profiles;
create trigger enforce_status_change_by_coach
  before update on public.profiles
  for each row
  execute function public.enforce_status_change_by_coach();
