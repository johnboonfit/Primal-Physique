-- Run this in the Supabase SQL Editor after body-measurements.sql.
--
-- Switches body_measurements from centimetres to inches. Renames
-- value_cm to value_in (a column that still said "cm" while holding
-- inches would be a landmine for anyone reading this schema later), and
-- converts any rows that were already logged in cm (÷ 2.54) so existing
-- history doesn't silently jump to the wrong scale — a client who logged
-- "85" (cm, waist) before this ran should see "33.5" (in) after, not a
-- number that's still literally 85 but now mislabeled as inches.

alter table public.body_measurements rename column value_cm to value_in;

update public.body_measurements set value_in = value_in / 2.54;

alter table public.body_measurements drop constraint if exists body_measurements_value_cm_check;
alter table public.body_measurements add constraint body_measurements_value_in_check check (value_in > 0);
