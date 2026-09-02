-- Run this in the Supabase SQL Editor after link-exercise-library.sql
-- (paste the whole file, click Run).
--
-- Adds three new columns to food_logs: protein, carbs, fat (grams,
-- nullable). Nullable rather than defaulted to 0 — a food logged before
-- this chunk genuinely has no macro data on record, and 0 would
-- misleadingly claim "this food has zero protein" instead of "we don't
-- know." The Nutrition tab treats a null macro as "not counted" when
-- summing the day's totals, not as zero.
--
-- Also adds source/source_id, purely for provenance (which API a food
-- came from, and its id there) — never used to look anything up live.
-- Every number in this table is a snapshot captured at the moment a
-- client logged it: if the food's real-world nutrition data changes
-- later, or the product disappears from the source entirely, this row
-- doesn't change, because nothing here ever reads back from the source.

alter table public.food_logs
  add column if not exists protein numeric,
  add column if not exists carbs numeric,
  add column if not exists fat numeric,
  add column if not exists source text,
  add column if not exists source_id text;
