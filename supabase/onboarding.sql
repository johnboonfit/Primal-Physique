-- Run this in the Supabase SQL Editor after external-forms.sql (paste
-- the whole file, click Run).
--
-- The start of the onboarding flow: welcome -> in-app signup -> PARQ ->
-- an optional health-advisory hold. Three real design decisions here,
-- explained where they happen below:
--
--   1. A NEW table (onboarding_parq_responses), not the External
--      Builder's response table from last chunk. That table is
--      deliberately anonymous (no client_id column at all -- the whole
--      point of a no-login public form). Onboarding's PARQ is filled
--      out by an authenticated client, and the safety gate needs to
--      know exactly whose account to hold, so this gets its own table,
--      reading the same question definitions but writing through
--      normal RLS instead of the anonymous SECURITY DEFINER gateway.
--
--   2. A real RLS gap this surfaces: a client is authenticated during
--      onboarding, but external_forms/external_form_questions only ever
--      granted coach read access -- the exact same class of bug the
--      readiness questionnaire hit (see readiness-client-access.sql).
--      Fixed the identical way: a policy granting read access
--      specifically to whichever form app_settings.parq_form_id points
--      at, additive to the existing coach-only policies.
--
--   3. The safety gate is a database trigger, not app-side code -- any
--      single_select question in the PARQ answered exactly "Yes" flags
--      the account, checked by reading the question's real type off
--      external_form_questions, not a hardcoded list of question ids.
--      A trigger means this can't be silently skipped by some future
--      code path that also writes to this table.

alter table public.app_settings
  add column if not exists parq_form_id uuid references public.external_forms (id) on delete set null;

alter table public.profiles
  add column if not exists onboarding_health_flagged boolean not null default false,
  add column if not exists onboarding_health_acknowledged_at timestamptz,
  add column if not exists onboarding_clearance_note text;

grant update (onboarding_health_acknowledged_at, onboarding_clearance_note) on public.profiles to authenticated;

create table if not exists public.onboarding_parq_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.external_form_questions (id) on delete cascade,
  answer jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (client_id, question_id)
);

alter table public.onboarding_parq_responses enable row level security;

drop policy if exists "Clients can view their own onboarding PARQ responses" on public.onboarding_parq_responses;
create policy "Clients can view their own onboarding PARQ responses"
  on public.onboarding_parq_responses for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can submit their own onboarding PARQ responses" on public.onboarding_parq_responses;
create policy "Clients can submit their own onboarding PARQ responses"
  on public.onboarding_parq_responses for insert
  with check (auth.uid() = client_id);

-- Needed alongside the insert policy so an upsert (insert ... on
-- conflict do update) works under RLS if a partially-failed submission
-- is ever retried -- same reasoning readiness_responses' own update
-- policy documents.
drop policy if exists "Clients can update their own onboarding PARQ responses" on public.onboarding_parq_responses;
create policy "Clients can update their own onboarding PARQ responses"
  on public.onboarding_parq_responses for update
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view onboarding PARQ responses" on public.onboarding_parq_responses;
create policy "Coaches can view onboarding PARQ responses"
  on public.onboarding_parq_responses for select
  using (public.is_coach());

-- Same shape as readiness-client-access.sql: additive to the existing
-- coach-only policies, grants a client read access specifically to
-- whichever form is currently "the" PARQ, not a client-specific
-- relationship.
drop policy if exists "Clients can view the active PARQ form" on public.external_forms;
create policy "Clients can view the active PARQ form"
  on public.external_forms for select
  using (exists (select 1 from public.app_settings s where s.parq_form_id = external_forms.id));

drop policy if exists "Clients can view questions in the active PARQ form" on public.external_form_questions;
create policy "Clients can view questions in the active PARQ form"
  on public.external_form_questions for select
  using (exists (select 1 from public.app_settings s where s.parq_form_id = external_form_questions.form_id));

-- The gate itself. Assumes every single_select question on the PARQ
-- template specifically is a yes/no health question (true of the
-- standard 7-question PAR-Q this app seeds) -- a coach repurposing this
-- exact template for something else would need a different rule, but
-- that's not what "PAR-Q Health Screening" is for.
create or replace function public.flag_onboarding_health_risk()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_question_type text;
begin
  select question_type into v_question_type from public.external_form_questions where id = new.question_id;
  if v_question_type = 'single_select' and new.answer = to_jsonb('Yes'::text) then
    update public.profiles set onboarding_health_flagged = true where id = new.client_id;
  end if;
  return new;
end;
$$;

-- Fires on update too, not just insert -- submitOnboardingParq() upserts
-- (in case a partially-failed submission is retried), and an upsert that
-- hits an existing row takes the UPDATE path, not INSERT.
drop trigger if exists flag_onboarding_health_risk_trigger on public.onboarding_parq_responses;
create trigger flag_onboarding_health_risk_trigger
  after insert or update on public.onboarding_parq_responses
  for each row execute function public.flag_onboarding_health_risk();

-- Points app_settings.parq_form_id at last chunk's seeded PAR-Q form --
-- only if nothing is configured yet, same "don't clobber a coach's own
-- choice" guard readiness.sql's own seed uses.
do $$
declare
  v_form_id uuid;
begin
  if not exists (select 1 from public.app_settings where parq_form_id is not null) then
    select id into v_form_id from public.external_forms where name = 'PAR-Q Health Screening' order by created_at limit 1;
    if v_form_id is not null then
      update public.app_settings set parq_form_id = v_form_id where id = true;
    end if;
  end if;
end $$;
