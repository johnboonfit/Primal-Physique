-- Run this in the Supabase SQL Editor after recipes.sql.
--
-- Adds the remaining nutrient fields the Nutri-Score formula needs
-- beyond the four basic macros recipe_ingredients already had --
-- sugars, saturated fat, sodium, and fibre -- plus an estimated
-- fruit/vegetable/legume/nut percentage. Same convention as every other
-- macro column here: these are the actual scaled/snapshotted amounts
-- for whatever quantity that ingredient is used at, cached at the
-- moment it's added to a recipe, never re-fetched later. The one
-- exception is fruit_veg_legume_nut_percent, which is a percentage (a
-- ratio, not an absolute amount) and so is stored as-is regardless of
-- quantity.
--
-- No RLS changes needed -- these are new columns on a table whose
-- existing row-level policies (in recipes.sql) already cover every
-- column on it; there's no other party who could ever need column-level
-- restrictions here the way profiles does.

alter table public.recipe_ingredients
  add column if not exists sugars numeric,
  add column if not exists saturated_fat numeric,
  add column if not exists sodium_mg numeric,
  add column if not exists fiber numeric,
  add column if not exists fruit_veg_legume_nut_percent numeric;
