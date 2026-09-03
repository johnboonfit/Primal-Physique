-- Run this in the Supabase SQL Editor after workout-set-types.sql.
--
-- A pre-workout readiness questionnaire, reusing the Forms question-type
-- system (form_templates/form_questions) built in Phase 8 -- but
-- deliberately NOT reusing form_assignments/form_check_ins, since none
-- of that recurrence/due-window machinery applies here: this isn't
-- scheduled, it's triggered by starting a workout.
--
-- Three things:
--
--   1. app_settings gains one column -- readiness_form_id, pointing at
--      whichever single form_templates row is "the" readiness
--      questionnaire right now. Same singleton-settings shape
--      community.sql already established for the Community on/off
--      switch. Every client sees the exact same template; there's no
--      per-client assignment of it.
--
--   2. readiness_responses -- one row per (workout session, question),
--      the same one-row-per-question shape form_responses already uses,
--      but linked straight to `assignments` (an actual scheduled
--      workout session) instead of a form_check_ins row. That's the
--      whole structural difference from the check-in system: a
--      response belongs to the specific session it precedes, full stop,
--      not to a recurring schedule.
--
--   3. A one-time default seed: if no readiness questionnaire is
--      configured yet anywhere, this creates one -- "Pre-Workout
--      Readiness" with four scale (1-10) questions (sleep quality,
--      muscle soreness, energy level, stress) -- owned by whichever
--      coach account already exists (earliest-created, same "any coach"
--      convention getAnyCoach() already uses elsewhere), and marks it
--      active. This only runs once: if a readiness questionnaire is
--      ever configured (this seed or a coach's own), it never runs
--      again. If no coach account exists yet when this is pasted in,
--      the seed silently does nothing rather than erroring -- a coach
--      can always build and set their own readiness form afterward from
--      the ordinary Forms screen.

alter table public.app_settings
  add column if not exists readiness_form_id uuid references public.form_templates (id) on delete set null;

create table if not exists public.readiness_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.form_questions (id) on delete cascade,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique (assignment_id, question_id)
);

alter table public.readiness_responses enable row level security;

drop policy if exists "Clients can view their own readiness responses" on public.readiness_responses;
create policy "Clients can view their own readiness responses"
  on public.readiness_responses for select
  using (auth.uid() = client_id);

-- Single-coach-app treatment, same as meal_plan_assignments -- any coach
-- can see any client's readiness answers, not just whoever's clients
-- they technically are.
drop policy if exists "Coaches can view readiness responses" on public.readiness_responses;
create policy "Coaches can view readiness responses"
  on public.readiness_responses for select
  using (public.is_coach());

-- Confirms the session (assignment) being answered for is actually the
-- client's own -- same "does this reference chain line up" shape
-- workout_logs' and form_responses' insert policies already use.
drop policy if exists "Clients can submit their own readiness responses" on public.readiness_responses;
create policy "Clients can submit their own readiness responses"
  on public.readiness_responses for insert
  with check (
    auth.uid() = client_id
    and exists (select 1 from public.assignments a where a.id = assignment_id and a.client_id = auth.uid())
  );

-- Needed alongside the insert policy so an upsert (insert ... on
-- conflict do update) works under RLS if a client's submission is ever
-- retried after a partial failure.
drop policy if exists "Clients can update their own readiness responses" on public.readiness_responses;
create policy "Clients can update their own readiness responses"
  on public.readiness_responses for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

do $$
declare
  default_coach_id uuid;
  new_form_id uuid;
begin
  if not exists (select 1 from public.app_settings where readiness_form_id is not null) then
    select id into default_coach_id from public.profiles where role = 'coach' order by created_at limit 1;

    if default_coach_id is not null then
      insert into public.form_templates (coach_id, name)
      values (default_coach_id, 'Pre-Workout Readiness')
      returning id into new_form_id;

      insert into public.form_questions (form_id, position, question_type, label, config) values
        (new_form_id, 0, 'scale', 'How was your sleep quality last night?', '{"min": 1, "max": 10}'::jsonb),
        (new_form_id, 1, 'scale', 'How sore are your muscles today?', '{"min": 1, "max": 10}'::jsonb),
        (new_form_id, 2, 'scale', 'What is your energy level right now?', '{"min": 1, "max": 10}'::jsonb),
        (new_form_id, 3, 'scale', 'How stressed do you feel today?', '{"min": 1, "max": 10}'::jsonb);

      update public.app_settings set readiness_form_id = new_form_id where id = true;
    end if;
  end if;
end $$;
