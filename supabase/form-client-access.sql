-- Run this in the Supabase SQL Editor after form-check-ins.sql (paste
-- the whole file, click Run).
--
-- Fixes a real gap: form_templates and form_questions only ever got
-- SELECT policies for the coach who owns them (form-templates.sql).
-- Nothing let a CLIENT read the form's name or its questions — so a
-- client's check-in list showed "Unknown form" (the embedded
-- form_templates(name) join came back null, silently blocked by RLS —
-- Postgres/PostgREST doesn't error on this, it just omits the row),
-- and the fill-out screen rendered no questions at all (the separate
-- form_questions query returned zero rows for the same reason) — just
-- the title and a submit button with nothing to answer.
--
-- Same shape as client-access.sql's "Clients can view workouts/
-- exercises assigned to them": a client can read a form (or its
-- questions) if they have a real reason to — either a recurring
-- assignment pointing at it, or an actual check-in occurrence already
-- generated for them. Neither policy queries its own table from
-- inside itself, so there's no risk of the infinite-recursion bug
-- assignments.sql's "Coaches can view client profiles" comment warns
-- about.

drop policy if exists "Clients can view forms assigned to them" on public.form_templates;
create policy "Clients can view forms assigned to them"
  on public.form_templates for select
  using (
    exists (select 1 from public.form_assignments fa where fa.form_id = form_templates.id and fa.client_id = auth.uid())
    or exists (select 1 from public.form_check_ins fc where fc.form_id = form_templates.id and fc.client_id = auth.uid())
  );

drop policy if exists "Clients can view questions in forms assigned to them" on public.form_questions;
create policy "Clients can view questions in forms assigned to them"
  on public.form_questions for select
  using (
    exists (select 1 from public.form_assignments fa where fa.form_id = form_questions.form_id and fa.client_id = auth.uid())
    or exists (select 1 from public.form_check_ins fc where fc.form_id = form_questions.form_id and fc.client_id = auth.uid())
  );
