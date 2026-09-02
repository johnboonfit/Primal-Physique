-- Run this in the Supabase SQL Editor after programmes.sql (paste the
-- whole file, click Run).
--
-- Adds exactly one column: programme_blocks.client_id, nullable. NULL
-- means "template" (shows up in the Template Library); set means "this
-- is one client's own independent copy of a programme," created by
-- duplicating a template and giving the copy to that client.
--
-- Nothing else changes. Assigning a programme does NOT create any new
-- kind of record for "what's scheduled and when" — it duplicates the
-- programme structure (same logic as the Template Library's Duplicate
-- button) into a copy owned by that client, then inserts ordinary rows
-- into the existing `assignments` table, one per session, with a
-- calculated date. Home's Up Next, the missed-workout auto-reschedule,
-- Momentum Score, and streaks all already read from `assignments` and
-- don't care where a workout came from — so all four pick up
-- programme-based sessions automatically, with no changes to any of
-- that code.
--
-- The client already has read access to their copied sessions too,
-- with no new policy needed: "Clients can view workouts assigned to
-- them" (from client-access.sql) already grants that the moment a real
-- assignments row exists for them.

alter table public.programme_blocks
  add column if not exists client_id uuid references public.profiles (id) on delete cascade;

-- Re-creates the insert policy from programmes.sql, adding one more
-- condition: if client_id is set, it has to actually point at a client
-- account — same defense-in-depth standard as every other
-- coach-assigns-something-to-a-client policy in this app (assignments,
-- workouts-into-programme-weeks).
drop policy if exists "Coaches can create programmes" on public.programme_blocks;
create policy "Coaches can create programmes"
  on public.programme_blocks for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
    and (
      client_id is null
      or exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
    )
  );
