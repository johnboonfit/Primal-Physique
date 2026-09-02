-- Run this in the Supabase SQL Editor after coach-nutrition-and-delete.sql
-- (order relative to the other weight_logs files doesn't matter — this
-- one only adds two columns).
--
-- Adds body_fat_percent and muscle_percent to weight_logs: manually
-- entered body-composition numbers, logged alongside weight on the same
-- per-day row (same table, same (client_id, log_date) uniqueness rule —
-- these are just two more optional facts about that day's check-in).
--
-- Both are nullable and NOT smoothed the way weight_trend is — there's
-- no EWMA calculation for these, no backfill, nothing computed. A client
-- can log weight without body fat/muscle %, or vice versa; whatever's
-- left blank on a given day just stays null for that row.

alter table public.weight_logs
  add column if not exists body_fat_percent numeric check (body_fat_percent is null or body_fat_percent between 0 and 100),
  add column if not exists muscle_percent numeric check (muscle_percent is null or muscle_percent between 0 and 100);
