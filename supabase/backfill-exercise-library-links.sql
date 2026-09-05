-- Run this in the Supabase SQL Editor whenever convenient — it doesn't
-- depend on anything else and nothing else depends on it landing at a
-- particular point in the migration order. Safe to re-run any time.
--
-- Fixes the real bug behind "the Volume Analyser doesn't show all
-- worked muscle groups": link-exercise-library.sql deliberately left
-- every workout_exercises row that existed before it at
-- exercise_library_id = null ("a bonus for later, not a dependency
-- now" — reasonable at the time, since nothing read that column yet).
-- Several real features built since then do now key off it to know
-- which muscle group (or which exercise, for PBs/progress) a logged
-- set belongs to: the Training tab's Volume Analyser
-- (muscle-group-analysis.ts), Progress's Exercise sub-tab
-- (exercise-progress.ts), and session PB tracking
-- (session-scorecard.ts). A set logged against a workout built before
-- that link existed doesn't error on any of these — it just silently
-- contributes nothing, which is exactly what surfaced as muscle groups
-- going quietly missing rather than showing 0 or an error.
--
-- Matches by exact name (case-insensitive, trimmed) —
-- exercise_library.name is unique, so this can only ever match one
-- row. Never overwrites an existing link (only touches rows where
-- exercise_library_id is currently null) and never guesses: a
-- workout_exercises.name with no matching library row (a coach's own
-- custom name, typed before the library existed) is left exactly as it
-- was — still fully nameable and displayable, just not categorizable
-- by muscle group, same "don't fabricate what genuinely isn't there"
-- rule this app follows everywhere else.
update public.workout_exercises we
set exercise_library_id = el.id
from public.exercise_library el
where we.exercise_library_id is null
  and lower(trim(we.name)) = lower(trim(el.name));

-- Run this afterwards to see what's still unmatched (a custom name a
-- coach typed before the library existed, or a genuine typo) — nothing
-- more can be done for these automatically without guessing, but it's
-- worth knowing how many, if any, remain:
--   select distinct we.name
--   from public.workout_exercises we
--   where we.exercise_library_id is null
--   order by we.name;
