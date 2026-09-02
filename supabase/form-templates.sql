-- Run this in the Supabase SQL Editor after lock-coach-role.sql (paste
-- the whole file, click Run).
--
-- Adds two tables for the check-in form builder — same shape as
-- programmes.sql's programme_blocks/programme_weeks: one parent row per
-- form the coach builds, one child row per question inside it, ordered
-- by `position`.
--
--   form_templates   one row per check-in form a coach creates (just a name)
--   form_questions    one row per question inside a form — its type, its
--                      label, and a `config` jsonb column holding whatever
--                      extra setup that type needs (a select's options, a
--                      scale's min/max, a measurement's unit label). Which
--                      keys `config` actually holds is entirely up to the
--                      app's question-type definitions
--                      (src/lib/question-types.ts), not fixed by this
--                      schema — that's what makes adding a new question
--                      type later a data change, not a migration.
--
-- Creation only this chunk — no scheduling or client-assignment tables
-- yet, and no client-facing "fill this out" screen. That's next chunk.

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.form_templates enable row level security;

drop policy if exists "Coaches can view their own forms" on public.form_templates;
create policy "Coaches can view their own forms"
  on public.form_templates for select
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can create forms" on public.form_templates;
create policy "Coaches can create forms"
  on public.form_templates for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

drop policy if exists "Coaches can delete their own forms" on public.form_templates;
create policy "Coaches can delete their own forms"
  on public.form_templates for delete
  using (auth.uid() = coach_id);

create table if not exists public.form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form_templates (id) on delete cascade,
  position int not null,
  question_type text not null check (
    question_type in ('short_text', 'number', 'single_select', 'multi_select', 'scale', 'measurement')
  ),
  label text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (form_id, position)
);

alter table public.form_questions enable row level security;

-- Same "check the parent belongs to me" shape as workout_exercises and
-- programme_weeks — there's no coach_id column here directly, only
-- form_id.
drop policy if exists "Coaches can view questions in their forms" on public.form_questions;
create policy "Coaches can view questions in their forms"
  on public.form_questions for select
  using (exists (select 1 from public.form_templates f where f.id = form_id and f.coach_id = auth.uid()));

drop policy if exists "Coaches can add questions to their forms" on public.form_questions;
create policy "Coaches can add questions to their forms"
  on public.form_questions for insert
  with check (exists (select 1 from public.form_templates f where f.id = form_id and f.coach_id = auth.uid()));

drop policy if exists "Coaches can delete questions in their forms" on public.form_questions;
create policy "Coaches can delete questions in their forms"
  on public.form_questions for delete
  using (exists (select 1 from public.form_templates f where f.id = form_id and f.coach_id = auth.uid()));
