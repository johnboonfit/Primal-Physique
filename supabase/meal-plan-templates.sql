-- Run this in the Supabase SQL Editor after nutri-score.sql.
--
-- Meal Plan Templates: a coach-owned reusable "day of eating" built from
-- recipes already in the Recipe Builder library, one per meal slot
-- (breakfast/lunch/dinner/snacks). Same template philosophy as
-- programme_blocks and recipes: build once, reuse for any client.
--
-- meal_plan_templates       one row per template (name, goal tag, target
--                           macro ratio as % of calories)
-- meal_plan_template_items  one row per (slot, recipe) in a template --
--                           which recipe fills that slot, and how many
--                           servings of it, at this template's baseline
-- meal_plan_assignments     one row per (template, client) -- just a
--                           pointer, not a frozen copy; see meal-plans.ts
--                           for why the scaled numbers are always
--                           recalculated live rather than stored here
--
-- Deliberately no "baseline_calories" column anywhere: the template's
-- baseline is always the real computed sum of its recipes at their
-- prescribed servings (see computeMealPlanTotals in meal-plans.ts), the
-- same "never store what can be computed" rule this app already applies
-- to recipe macros and Nutri-Score. A manually-typed baseline number
-- could silently drift from what the recipes actually add up to; a
-- computed one can't.

create table if not exists public.meal_plan_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  goal_type text not null check (goal_type in ('cutting', 'bulking', 'recomp', 'strength')),
  target_protein_percent int not null check (target_protein_percent between 0 and 100),
  target_carb_percent int not null check (target_carb_percent between 0 and 100),
  target_fat_percent int not null check (target_fat_percent between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.meal_plan_templates enable row level security;

drop policy if exists "Coaches can view their own meal plan templates" on public.meal_plan_templates;
create policy "Coaches can view their own meal plan templates"
  on public.meal_plan_templates for select
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can create meal plan templates" on public.meal_plan_templates;
create policy "Coaches can create meal plan templates"
  on public.meal_plan_templates for insert
  with check (auth.uid() = coach_id and public.is_coach());

drop policy if exists "Coaches can update their own meal plan templates" on public.meal_plan_templates;
create policy "Coaches can update their own meal plan templates"
  on public.meal_plan_templates for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

drop policy if exists "Coaches can delete their own meal plan templates" on public.meal_plan_templates;
create policy "Coaches can delete their own meal plan templates"
  on public.meal_plan_templates for delete
  using (auth.uid() = coach_id);

create table if not exists public.meal_plan_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_plan_templates (id) on delete cascade,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snacks')),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  -- How many servings of this recipe this slot calls for AT BASELINE --
  -- scaled proportionally, along with every ingredient inside the
  -- recipe, when a template is assigned to a client (see meal-plans.ts).
  servings numeric not null check (servings > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.meal_plan_template_items enable row level security;

-- Same "check the parent belongs to me" shape as programme_weeks and
-- recipe_ingredients -- no coach_id column here directly, only
-- template_id.
drop policy if exists "Coaches can view items in their meal plan templates" on public.meal_plan_template_items;
create policy "Coaches can view items in their meal plan templates"
  on public.meal_plan_template_items for select
  using (exists (select 1 from public.meal_plan_templates t where t.id = template_id and t.coach_id = auth.uid()));

-- Insert also checks the referenced recipe belongs to the same coach --
-- without this, a coach could point a meal plan item at another coach's
-- recipe_id via a direct API call (recipes.sql's own RLS stops them from
-- ever seeing that recipe's contents, but doesn't stop this table from
-- referencing an ID it can't read).
drop policy if exists "Coaches can add items to their meal plan templates" on public.meal_plan_template_items;
create policy "Coaches can add items to their meal plan templates"
  on public.meal_plan_template_items for insert
  with check (
    exists (select 1 from public.meal_plan_templates t where t.id = template_id and t.coach_id = auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.coach_id = auth.uid())
  );

drop policy if exists "Coaches can delete items from their meal plan templates" on public.meal_plan_template_items;
create policy "Coaches can delete items from their meal plan templates"
  on public.meal_plan_template_items for delete
  using (exists (select 1 from public.meal_plan_templates t where t.id = template_id and t.coach_id = auth.uid()));

create table if not exists public.meal_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_plan_templates (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now()
);

alter table public.meal_plan_assignments enable row level security;

-- Same single-coach-app treatment as assignments.sql: any coach can see
-- and manage any assignment (is_coach(), not coach_id = auth.uid()).
-- This is lower-stakes than it looks -- a coach can still only ever pick
-- from templates they can see in the app (their own, per the RLS above),
-- so in practice this never lets a coach touch another coach's private
-- template even though the policy itself is broad.
drop policy if exists "Coaches can view meal plan assignments" on public.meal_plan_assignments;
create policy "Coaches can view meal plan assignments"
  on public.meal_plan_assignments for select
  using (public.is_coach());

drop policy if exists "Coaches can create meal plan assignments" on public.meal_plan_assignments;
create policy "Coaches can create meal plan assignments"
  on public.meal_plan_assignments for insert
  with check (public.is_coach());

drop policy if exists "Coaches can delete meal plan assignments" on public.meal_plan_assignments;
create policy "Coaches can delete meal plan assignments"
  on public.meal_plan_assignments for delete
  using (public.is_coach());
