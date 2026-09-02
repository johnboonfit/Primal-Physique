-- Run this in the Supabase SQL Editor after link-exercise-library.sql
-- (or after whichever food_logs migration you last ran — this only
-- touches food_logs, order relative to the barcode-scanning chunk
-- doesn't matter).
--
-- Adds quantity_grams: how many grams of the food were actually logged.
-- Every entry so far (both search and barcode) was logged assuming
-- exactly 100g, so backfilling existing rows to 100 is a real fact
-- about them, not a guess — unlike protein/carbs/fat, which genuinely
-- weren't recorded for old entries and stayed NULL.
--
-- From here on, calories/protein/carbs/fat in food_logs represent the
-- ACTUAL amount logged (already scaled for whatever quantity the client
-- entered), not a per-100g reference figure. The per-100g numbers a
-- search result or barcode scan shows are just the source data used to
-- calculate that scaled amount at the moment of logging — same
-- snapshot-not-a-live-reference rule as before, just one more
-- multiplication before saving.

alter table public.food_logs
  add column if not exists quantity_grams numeric not null default 100;
