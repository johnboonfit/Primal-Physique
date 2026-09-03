-- Run this in the Supabase SQL Editor after readiness-client-access.sql.
--
-- Adds one column, session_rpe -- the client's own overall rating of how
-- the WHOLE session felt, captured once at the end, separate from the
-- per-set RPE the live session screen already asks for after each
-- exercise's last set. It lives on assignments, not workout_logs, since
-- it's a single value per session, not per set.
--
-- assignments already had its UPDATE privilege locked down to specific
-- columns (reschedule.sql) -- a client can currently only ever change
-- status and assigned_date on their own row. This grant adds session_rpe
-- to that same allow-list; without it, saving the rating would fail with
-- a real Postgres permission error the moment it's used, not silently.

alter table public.assignments
  add column if not exists session_rpe numeric check (session_rpe is null or (session_rpe >= 1 and session_rpe <= 10));

grant update (session_rpe) on public.assignments to authenticated;
