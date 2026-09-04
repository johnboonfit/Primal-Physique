-- Run this in the Supabase SQL Editor after exercise-removals.sql
-- (paste the whole file, click Run).
--
-- Saved Meals: a client's own reusable meal templates, built from
-- whatever they've already logged -- "everything under Breakfast
-- today" becomes "My protein breakfast," saveable once and re-logged
-- any day after with one tap, no re-searching USDA/Open Food Facts.
--
-- Same "snapshot at the moment it's captured, never a live reference"
-- rule as food_logs and recipe_ingredients: each item's macros are
-- copied in from the food_logs row that fed it, scaled for whatever
-- quantity was actually logged. Nothing here ever reads back from
-- USDA/Open Food Facts or re-scales anything later.
--
-- Client-owned only, not coach-visible -- unlike food_logs (which the
-- coach's Nutrition panel reads), a saved meal is just a personal
-- shortcut template, not a record of what was actually eaten, so
-- there's nothing here for a coach to review.
--
-- saved_meals        one row per template a client creates (name only)
-- saved_meal_items    one row per food item in that template, same
--                     shape as food_logs' own scaled snapshot columns

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.saved_meals enable row level security;

drop policy if exists "Clients can view their own saved meals" on public.saved_meals;
create policy "Clients can view their own saved meals"
  on public.saved_meals for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can create their own saved meals" on public.saved_meals;
create policy "Clients can create their own saved meals"
  on public.saved_meals for insert
  with check (auth.uid() = client_id);

drop policy if exists "Clients can delete their own saved meals" on public.saved_meals;
create policy "Clients can delete their own saved meals"
  on public.saved_meals for delete
  using (auth.uid() = client_id);

create table if not exists public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals (id) on delete cascade,
  food_name text not null,
  -- Scaled, snapshotted amounts for THIS quantity -- not per-100g
  -- reference figures. Same convention as food_logs/recipe_ingredients.
  quantity_grams numeric not null check (quantity_grams > 0),
  calories numeric not null,
  protein numeric,
  carbs numeric,
  fat numeric,
  -- Nullable, same as food_logs.source -- a saved meal built from an
  -- old food_logs row logged before source/source_id existed shouldn't
  -- fail to save over it. Purely provenance either way, never read
  -- back to look anything up.
  source text check (source is null or source in ('usda_fdc', 'open_food_facts')),
  source_id text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.saved_meal_items enable row level security;

-- Same "check the parent belongs to me" shape as recipe_ingredients --
-- no client_id column here directly, only saved_meal_id.
drop policy if exists "Clients can view items in their own saved meals" on public.saved_meal_items;
create policy "Clients can view items in their own saved meals"
  on public.saved_meal_items for select
  using (exists (select 1 from public.saved_meals m where m.id = saved_meal_id and m.client_id = auth.uid()));

drop policy if exists "Clients can add items to their own saved meals" on public.saved_meal_items;
create policy "Clients can add items to their own saved meals"
  on public.saved_meal_items for insert
  with check (exists (select 1 from public.saved_meals m where m.id = saved_meal_id and m.client_id = auth.uid()));

-- Not strictly needed today (deleting a saved meal cascades to its
-- items automatically), but a real "remove this on item mistake" DELETE
-- policy costs nothing and matches food_logs' own per-row delete.
drop policy if exists "Clients can delete items from their own saved meals" on public.saved_meal_items;
create policy "Clients can delete items from their own saved meals"
  on public.saved_meal_items for delete
  using (exists (select 1 from public.saved_meals m where m.id = saved_meal_id and m.client_id = auth.uid()));
