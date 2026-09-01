-- Run this in the Supabase SQL Editor after workout-logs.sql (paste the
-- whole file, click Run).
--
-- So far only the client who logged a workout could see their own
-- workout_logs rows. This adds one read-only rule letting the coach who
-- made the assignment see those same logs too — needed so the coach can
-- view what a client actually did.

drop policy if exists "Coaches can view logs for their own assignments" on public.workout_logs;
create policy "Coaches can view logs for their own assignments"
  on public.workout_logs for select
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.coach_id = auth.uid()
    )
  );
