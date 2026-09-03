-- Run this in the Supabase SQL Editor after chat-read-receipts.sql (paste
-- the whole file, click Run).
--
-- The coach's Recipe Builder: reusable recipes made of ingredients drawn
-- from the same USDA FoodData Central / Open Food Facts search already
-- used for food logging. Each ingredient's macros are snapshotted at the
-- moment it's added to a recipe -- exactly like food_logs already does --
-- so a recipe's numbers never silently drift if the source database's
-- figures change later, or the ingredient disappears from that source
-- entirely.
--
-- Macros per serving are deliberately NEVER stored as a column: they're
-- always calculated on the fly (sum every ingredient, divide by
-- servings), so there's no denormalized number that could go stale or
-- get typed in wrong by hand.
--
-- recipes             one row per recipe a coach builds (name, cover
--                     photo, instructions, prep/cook time, servings, tags)
-- recipe_ingredients  one row per ingredient in a recipe, snapshotting
--                     its scaled macros for whatever quantity that
--                     ingredient is used at -- same shape as food_logs.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  photo_storage_path text,
  instructions text not null default '',
  prep_minutes int not null default 0 check (prep_minutes >= 0),
  cook_minutes int not null default 0 check (cook_minutes >= 0),
  servings int not null check (servings > 0),
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

alter table public.recipes enable row level security;

-- Recipes are the coach's own working library -- nobody else (there's no
-- client-facing view of them yet) ever needs to read or write these rows,
-- so this is a plain "you own it" set of policies, no column lockdown
-- needed anywhere.
drop policy if exists "Coaches can view their own recipes" on public.recipes;
create policy "Coaches can view their own recipes"
  on public.recipes for select
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can create recipes" on public.recipes;
create policy "Coaches can create recipes"
  on public.recipes for insert
  with check (auth.uid() = coach_id and public.is_coach());

drop policy if exists "Coaches can update their own recipes" on public.recipes;
create policy "Coaches can update their own recipes"
  on public.recipes for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

drop policy if exists "Coaches can delete their own recipes" on public.recipes;
create policy "Coaches can delete their own recipes"
  on public.recipes for delete
  using (auth.uid() = coach_id);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  name text not null,
  quantity_grams numeric not null check (quantity_grams > 0),
  -- Scaled, snapshotted amounts for THIS quantity -- not per-100g
  -- reference figures. Same convention as food_logs.
  calories numeric not null,
  protein numeric,
  carbs numeric,
  fat numeric,
  source text not null check (source in ('usda_fdc', 'open_food_facts')),
  source_id text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.recipe_ingredients enable row level security;

-- Same "check the parent belongs to me" shape as programme_weeks -- no
-- coach_id column here directly, only recipe_id.
drop policy if exists "Coaches can view ingredients in their recipes" on public.recipe_ingredients;
create policy "Coaches can view ingredients in their recipes"
  on public.recipe_ingredients for select
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.coach_id = auth.uid()));

drop policy if exists "Coaches can add ingredients to their recipes" on public.recipe_ingredients;
create policy "Coaches can add ingredients to their recipes"
  on public.recipe_ingredients for insert
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.coach_id = auth.uid()));

drop policy if exists "Coaches can delete ingredients from their recipes" on public.recipe_ingredients;
create policy "Coaches can delete ingredients from their recipes"
  on public.recipe_ingredients for delete
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.coach_id = auth.uid()));

-- Private Storage bucket for recipe cover photos -- same shape as
-- progress-photos.sql: a private bucket, with path-prefix RLS so a coach
-- can only ever touch files under their own folder
-- ("<coach_id>/<filename>").
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', false)
on conflict (id) do nothing;

drop policy if exists "Coaches can view their own recipe photo files" on storage.objects;
create policy "Coaches can view their own recipe photo files"
  on storage.objects for select
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Coaches can upload their own recipe photo files" on storage.objects;
create policy "Coaches can upload their own recipe photo files"
  on storage.objects for insert
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Coaches can delete their own recipe photo files" on storage.objects;
create policy "Coaches can delete their own recipe photo files"
  on storage.objects for delete
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
