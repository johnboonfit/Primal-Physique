-- Run this in the Supabase SQL Editor after exercise-library.sql (paste
-- the whole file, click Run).
--
-- Adds one new, optional column: workout_exercises.exercise_library_id,
-- linking an exercise row to a specific row in the exercise_library
-- table instead of (or alongside) its free-text name.
--
-- This needs no migration of existing data and changes nothing about
-- how any existing workout displays. Every screen that shows an
-- exercise reads workout_exercises.name directly — that column is
-- untouched, so every exercise typed in before this chunk keeps
-- displaying exactly as it always has, with exercise_library_id simply
-- NULL. Going forward, the workout builder copies the selected library
-- exercise's name into `name` at save time (same as if it had been
-- typed) and ALSO stores the link — so `name` stays the one thing every
-- display query depends on, old rows and new rows alike, and the link
-- is a bonus for later, not a dependency now.
--
-- "on delete set null" rather than cascade: if an exercise_library row
-- were ever removed, the workout_exercises row that referenced it
-- should keep existing (with whatever name was already copied into it)
-- — losing the link is fine, silently deleting a coach's real workout
-- history because of an edit to shared reference data is not.

alter table public.workout_exercises
  add column if not exists exercise_library_id uuid references public.exercise_library (id) on delete set null;
