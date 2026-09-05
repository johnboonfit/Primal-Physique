-- Run this in the Supabase SQL Editor after food-log-edit-quantity.sql
-- (paste the whole file, click Run).
--
-- exercise_library has been seed-only since it was first created (see
-- exercise-library.sql's own header comment: "No app code ever writes to
-- this table") -- 872 imported reference exercises, no insert/update/
-- delete policy at all. This adds the ability for the coach to add their
-- OWN exercises on top of that seeded set, with the exact same fields
-- every seeded row has (category, muscle group, primary/secondary
-- muscles, equipment, instructions, description) plus a video link --
-- and, once added, it's usable when building a workout exactly like any
-- of the 872 seeded ones, since the workout builder searches this same
-- table with no distinction between the two.
--
-- is_custom / created_by mark which rows are the coach's own. The coach
-- can edit or delete only those -- the original seeded reference data
-- stays permanently read-only, exactly as it always has been. (Single-
-- coach app, so "created_by = auth.uid()" and "is the coach" are almost
-- the same check, but both are still enforced for defense in depth and
-- to keep this table's policies self-explanatory on their own.)
alter table public.exercise_library add column if not exists is_custom boolean not null default false;
alter table public.exercise_library add column if not exists created_by uuid references public.profiles (id) on delete set null;

drop policy if exists "Coaches can add custom exercises" on public.exercise_library;
create policy "Coaches can add custom exercises"
  on public.exercise_library for insert
  with check (public.is_coach() and is_custom = true and created_by = auth.uid());

drop policy if exists "Coaches can edit their own custom exercises" on public.exercise_library;
create policy "Coaches can edit their own custom exercises"
  on public.exercise_library for update
  using (public.is_coach() and is_custom = true and created_by = auth.uid())
  with check (public.is_coach() and is_custom = true and created_by = auth.uid());

drop policy if exists "Coaches can delete their own custom exercises" on public.exercise_library;
create policy "Coaches can delete their own custom exercises"
  on public.exercise_library for delete
  using (public.is_coach() and is_custom = true and created_by = auth.uid());
