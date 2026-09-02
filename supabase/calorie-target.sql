-- Run this in the Supabase SQL Editor after tdee-estimates.sql.
--
-- Adds programme_blocks.calorie_target_percent: the coach-adjustable %
-- above/below TDEE for a client's current phase (Cutting: -20 to -15,
-- Bulking: +10 to +15, Recomp/Strength: fixed 0%, not stored here at
-- all). NULL means "use this goal type's default" (-17.5% for Cutting,
-- +12.5% for Bulking) — a coach only needs to touch this when they want
-- something other than the middle of the range.
--
-- No RLS changes needed: this column lives on programme_blocks, which
-- already has "Coaches can update their own programmes" (no column
-- restriction) and clients already have read-only access to their own
-- assigned programme via "Clients can view their own assigned
-- programme" (both from earlier migrations).

alter table public.programme_blocks
  add column if not exists calorie_target_percent numeric
    check (calorie_target_percent is null or calorie_target_percent between -50 and 50);
