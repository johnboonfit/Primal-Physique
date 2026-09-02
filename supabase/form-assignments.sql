-- Run this in the Supabase SQL Editor after form-templates.sql (paste
-- the whole file, click Run).
--
-- Adds one table: form_assignments — which check-in form, which client,
-- and a recurrence rule for how often the client should fill it out.
--
-- Deliberately just one row per assignment, not one row per future
-- occurrence: a weekly check-in never ends on its own, so there's no
-- fixed number of future dates to pre-generate the way an 8-week
-- programme's sessions get pre-generated at assign time. Instead this
-- stores the rule (which day of the week, and how many hours after that
-- day still counts as "on time"), and the app computes actual scheduled
-- dates from that rule on demand, walking forward from whatever "today"
-- is at the moment it's asked — see listUpcomingCheckInDates() in
-- src/lib/form-assignments.ts. Keeping it to "weekly on one day" only
-- (not a general recurrence-rule system) is deliberate for this chunk;
-- a coach who wants twice a week can just create two assignments for
-- the same client and form on different days — nothing here stops that.
--
-- recurrence_day reuses the exact same day keys as
-- programme_blocks.scheduled_days ('mon'..'sun'), not a new
-- representation, so both features mean the same thing by "Monday."
--
-- No submissions/responses table yet, and no client-facing "fill this
-- out" screen — this chunk is the recurring assignment only.

create table if not exists public.form_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  form_id uuid not null references public.form_templates (id) on delete cascade,
  recurrence_day text not null check (recurrence_day in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  due_window_hours int not null check (due_window_hours > 0),
  created_at timestamptz not null default now()
);

alter table public.form_assignments enable row level security;

drop policy if exists "Coaches can view their own form assignments" on public.form_assignments;
create policy "Coaches can view their own form assignments"
  on public.form_assignments for select
  using (auth.uid() = coach_id);

-- Same four-part check every other "coach assigns X to Y" insert policy
-- in this app uses (assignments.sql, habits.sql, assign-programme.sql):
-- you're the coach, your account is actually a coach, the client is
-- actually a client, and the form you're assigning is one of your own.
drop policy if exists "Coaches can create form assignments" on public.form_assignments;
create policy "Coaches can create form assignments"
  on public.form_assignments for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
    and exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
    and exists (select 1 from public.form_templates f where f.id = form_id and f.coach_id = auth.uid())
  );

drop policy if exists "Clients can view their own form assignments" on public.form_assignments;
create policy "Clients can view their own form assignments"
  on public.form_assignments for select
  using (auth.uid() = client_id);
