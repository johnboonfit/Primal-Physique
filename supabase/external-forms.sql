-- Run this in the Supabase SQL Editor after toggle-presets.sql (paste
-- the whole file, click Run).
--
-- The External Builder: a second, one-off form type alongside the
-- Check-in Builder (form-templates.sql/form-check-ins.sql) — shareable
-- via a public link, viewable and submittable with NO login at all,
-- rather than recurring and tied to an existing client account.
--
-- The security model is the important part here. Every other table in
-- this app is protected by RLS keyed to auth.uid() -- a real signed-in
-- identity. A stranger filling out a link has none. The wrong fix would
-- be a blanket "anyone can read/write this table" RLS policy: that would
-- let anyone holding this app's public API key (which ships in every
-- install, by design -- see .env.example) list EVERY external form and
-- EVERY response ever submitted, not just the one form they were sent a
-- link to.
--
-- Instead: these three tables get NO direct anonymous grant at all.
-- Every anonymous read and write goes through exactly two functions
-- below (get_external_form_by_token / submit_external_form_response),
-- both SECURITY DEFINER -- the same mechanism this app already uses for
-- leaderboards (get_weekly_xp_leaderboard). A visitor can only ever see
-- the one form whose share_token matches their link, and can only ever
-- submit answers against that same form's real question ids -- there is
-- no path from "have the public API key" to "see or write anyone else's
-- data."

create table if not exists public.external_forms (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- 24 hex characters from 12 random bytes -- long enough that guessing
  -- one isn't realistic, short enough to fit in a text message.
  share_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.external_form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.external_forms (id) on delete cascade,
  -- Named question_position, not position -- position is a reserved
  -- word in Postgres (it doubles as the POSITION(substring IN string)
  -- function), which breaks unquoted in some contexts (a function's
  -- RETURNS TABLE column list, in particular) even though a plain
  -- CREATE TABLE tolerates it. Renaming avoids needing to remember to
  -- quote it correctly forever after.
  question_position int not null,
  question_type text not null,
  label text not null,
  config jsonb not null default '{}'::jsonb
);

create table if not exists public.external_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.external_forms (id) on delete cascade,
  question_id uuid not null references public.external_form_questions (id) on delete cascade,
  answer jsonb not null,
  submitted_at timestamptz not null default now(),
  -- Groups every answer from the SAME visitor's one sitting together --
  -- there's no client_id to group by instead, since the whole point of
  -- this form type is that it doesn't require an account.
  submission_id uuid not null default gen_random_uuid()
);

alter table public.external_forms enable row level security;
alter table public.external_form_questions enable row level security;
alter table public.external_form_responses enable row level security;

-- Coach-only direct table access (the builder, the list, the detail
-- page, and the submitted-responses view all go through these) --
-- anonymous access never touches these policies at all, see the two
-- functions below instead.

drop policy if exists "Coaches can view their own external forms" on public.external_forms;
create policy "Coaches can view their own external forms"
  on public.external_forms for select
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can create external forms" on public.external_forms;
create policy "Coaches can create external forms"
  on public.external_forms for insert
  with check (auth.uid() = coach_id and public.is_coach());

drop policy if exists "Coaches can delete their own external forms" on public.external_forms;
create policy "Coaches can delete their own external forms"
  on public.external_forms for delete
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can view questions in their own external forms" on public.external_form_questions;
create policy "Coaches can view questions in their own external forms"
  on public.external_form_questions for select
  using (exists (select 1 from public.external_forms f where f.id = form_id and f.coach_id = auth.uid()));

drop policy if exists "Coaches can add questions to their own external forms" on public.external_form_questions;
create policy "Coaches can add questions to their own external forms"
  on public.external_form_questions for insert
  with check (exists (select 1 from public.external_forms f where f.id = form_id and f.coach_id = auth.uid()));

drop policy if exists "Coaches can view responses to their own external forms" on public.external_form_responses;
create policy "Coaches can view responses to their own external forms"
  on public.external_form_responses for select
  using (exists (select 1 from public.external_forms f where f.id = form_id and f.coach_id = auth.uid()));

-- Anonymous read: the ONE way a visitor can see a form is by its exact
-- token. No token match -> no rows, not an error -- same "not found"
-- experience whether the link is wrong or was never real.
create or replace function public.get_external_form_by_token(p_token text)
returns table (
  form_id uuid,
  form_name text,
  question_id uuid,
  question_position int,
  question_type text,
  label text,
  config jsonb
)
language sql
security definer
set search_path = public
as $$
  select f.id, f.name, q.id, q.question_position, q.question_type, q.label, q.config
  from public.external_forms f
  join public.external_form_questions q on q.form_id = f.id
  where f.share_token = p_token
  order by q.question_position;
$$;

grant execute on function public.get_external_form_by_token(text) to anon, authenticated;

-- Anonymous write: p_answers is a jsonb array of {question_id, answer}
-- objects. Each one is only inserted if question_id genuinely belongs to
-- the form the token resolved to -- stops a crafted request from writing
-- an answer against some other form's question id.
create or replace function public.submit_external_form_response(p_token text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_id uuid;
  v_submission_id uuid := gen_random_uuid();
  v_answer record;
begin
  select id into v_form_id from public.external_forms where share_token = p_token;
  if v_form_id is null then
    raise exception 'Form not found.';
  end if;

  for v_answer in select * from jsonb_to_recordset(p_answers) as x(question_id uuid, answer jsonb)
  loop
    if exists (
      select 1 from public.external_form_questions
      where id = v_answer.question_id and form_id = v_form_id
    ) then
      insert into public.external_form_responses (form_id, question_id, answer, submission_id)
      values (v_form_id, v_answer.question_id, v_answer.answer, v_submission_id);
    end if;
  end loop;
end;
$$;

grant execute on function public.submit_external_form_response(text, jsonb) to anon, authenticated;

-- Seeds the real PAR-Q (Physical Activity Readiness Questionnaire) --
-- the standard 7-question pre-exercise health screen, plus two plain
-- identifying questions up front since there's no login to identify a
-- respondent by. Only seeds once, for whichever coach account exists
-- first, same pattern readiness.sql already uses for its own default
-- form.
do $$
declare
  default_coach_id uuid;
  new_form_id uuid;
begin
  if not exists (select 1 from public.external_forms where name = 'PAR-Q Health Screening') then
    select id into default_coach_id from public.profiles where role = 'coach' order by created_at limit 1;

    if default_coach_id is not null then
      insert into public.external_forms (coach_id, name)
      values (default_coach_id, 'PAR-Q Health Screening')
      returning id into new_form_id;

      insert into public.external_form_questions (form_id, question_position, question_type, label, config) values
        (new_form_id, 0, 'short_text', 'Full name', '{}'::jsonb),
        (new_form_id, 1, 'short_text', 'Email', '{}'::jsonb),
        (new_form_id, 2, 'single_select', 'Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?', '{"options": ["Yes", "No"]}'::jsonb),
        (new_form_id, 3, 'single_select', 'Do you feel pain in your chest when you do physical activity?', '{"options": ["Yes", "No"]}'::jsonb),
        (new_form_id, 4, 'single_select', 'In the past month, have you had chest pain when you were not doing physical activity?', '{"options": ["Yes", "No"]}'::jsonb),
        (new_form_id, 5, 'single_select', 'Do you lose your balance because of dizziness, or do you ever lose consciousness?', '{"options": ["Yes", "No"]}'::jsonb),
        (new_form_id, 6, 'single_select', 'Do you have a bone or joint problem that could be made worse by a change in your physical activity?', '{"options": ["Yes", "No"]}'::jsonb),
        (new_form_id, 7, 'single_select', 'Is your doctor currently prescribing drugs for your blood pressure or a heart condition?', '{"options": ["Yes", "No"]}'::jsonb),
        (new_form_id, 8, 'single_select', 'Do you know of any other reason why you should not do physical activity?', '{"options": ["Yes", "No"]}'::jsonb);
    end if;
  end if;
end $$;
