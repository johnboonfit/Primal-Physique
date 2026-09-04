-- Run this in the Supabase SQL Editor after client-deletion.sql (paste
-- the whole file, click Run).
--
-- The coach's new cross-client Activity feed needs two things this
-- schema doesn't have yet:
--
-- 1. Coaches have never had read access to habit_logs -- only a client
--    can see their own (habits.sql only grants habits itself, not the
--    per-day completion rows). That's why the earlier "Recent Activity"
--    preview on the coach dashboard only ever showed meals and workouts.
--    It's also a second, quieter bug: getMomentumScore() reads habit_logs
--    too, so a coach computing a client's Momentum Score has always
--    silently undercounted that client's habit component -- there was
--    simply nothing there to read. One policy fixes both.
--
-- 2. Realtime delivery is opt-in per table in Supabase -- only
--    `messages` and `conversation_reads` (chat.sql / chat-read-
--    receipts.sql) have ever been added to the replication publication.
--    The activity feed needs to hear about new food_logs and habit_logs
--    rows, and assignments rows changing to status = 'completed'.

drop policy if exists "Coaches can view their clients' habit logs" on public.habit_logs;
create policy "Coaches can view their clients' habit logs"
  on public.habit_logs for select
  using (
    exists (
      select 1 from public.habits h
      where h.id = habit_logs.habit_id
        and h.coach_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.food_logs;
alter publication supabase_realtime add table public.habit_logs;
alter publication supabase_realtime add table public.assignments;
