-- Run this in the Supabase SQL Editor after live-session.sql.
--
-- Fixes a real RLS gap: the readiness questionnaire (readiness.sql)
-- deliberately reads its active form straight from
-- app_settings.readiness_form_id, bypassing form_assignments/
-- form_check_ins entirely -- a readiness check isn't a recurring
-- assignment or a scheduled check-in occurrence (see readiness.sql's own
-- header for why). But form_templates/form_questions' only client-facing
-- read policies (form-client-access.sql) check exactly those two tables
-- -- so a client has never actually had permission to read the readiness
-- questionnaire itself. Postgres/PostgREST doesn't error on this the way
-- a permission-denied would; it just returns zero rows, which
-- getFormTemplateDetail()'s .single() then reports as "Cannot coerce the
-- result to a single JSON object" -- for every workout a client opens,
-- since the readiness check runs before every single session.
--
-- The fix: grant read access to a form specifically when it's the one
-- currently configured as the active readiness questionnaire --
-- additive to, not replacing, the existing "assigned to them" access.
-- No auth.uid() check needed here (unlike the assigned-to-them policies)
-- -- the whole point of "the active readiness form" is that every client
-- sees the exact same one before every session, not a client-specific
-- relationship.

drop policy if exists "Clients can view the active readiness form" on public.form_templates;
create policy "Clients can view the active readiness form"
  on public.form_templates for select
  using (
    exists (select 1 from public.app_settings s where s.readiness_form_id = form_templates.id)
  );

drop policy if exists "Clients can view questions in the active readiness form" on public.form_questions;
create policy "Clients can view questions in the active readiness form"
  on public.form_questions for select
  using (
    exists (select 1 from public.app_settings s where s.readiness_form_id = form_questions.form_id)
  );
