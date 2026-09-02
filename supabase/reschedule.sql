-- Run this in the Supabase SQL Editor after workout-logs.sql (paste the
-- whole file, click Run).
--
-- This chunk lets a client's own assigned_date get moved — either
-- automatically (missed-workout reschedule) or by the client picking a
-- new date themselves. That's the first time a client has had a
-- legitimate reason to update assigned_date, which exposed the same
-- kind of gap the profiles table had before it was locked down: the
-- "Clients can update their own assignment status" policy only checks
-- WHICH ROW (their own), not WHICH COLUMNS. Right now that means a
-- client calling the Supabase API directly, bypassing the app, could
-- already update ANY column on their own assignment — including
-- workout_id or coach_id — not just status. This closes that down so a
-- client can only ever change status and assigned_date on their own
-- assignments.

revoke update on public.assignments from authenticated;
grant update (status, assigned_date) on public.assignments to authenticated;
