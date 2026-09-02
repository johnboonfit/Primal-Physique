-- Run this in the Supabase SQL Editor after form-assignments.sql (paste
-- the whole file, click Run).
--
-- Three things:
--
--   1. form_assignments gets an `archived` column + an UPDATE policy —
--      "cancel a client's recurring schedule" is an archive (same
--      reasoning as habits/workouts/programmes: other rows point at
--      this one, so a real delete would be destructive), never a
--      hard delete. Cancelling stops new check-ins from being
--      generated; it does NOT touch check-ins already generated.
--
--   2. form_check_ins — one row per actual scheduled occurrence,
--      materialized lazily (see ensureCheckInsUpToDate() in
--      src/lib/form-check-ins.ts) starting 2 days before it's due, not
--      pre-generated indefinitely. Three states: 'pending' (not yet
--      done), 'completed' (submitted), 'missed' (not completed within
--      a week of its due date). `archived` is a separate flag from
--      `status` on purpose: it's what actually hides a row from the
--      client's Up Next/Calendar, while `status` records what
--      genuinely happened — a missed check-in is marked BOTH
--      status='missed' AND archived=true at the same time, but the
--      row itself is never deleted, because Compliance Score / On
--      Time/Late tracking need it to still exist and be queryable.
--
--   3. form_responses — one row per (check-in, question), mirroring
--      workout_logs' one-row-per-exercise shape rather than one JSON
--      blob per submission. `answer` is jsonb because the shape
--      genuinely varies by question type (a string, a number, or an
--      array of strings for multi-select) — same reasoning
--      form_questions.config already uses jsonb for the same reason.

alter table public.form_assignments add column if not exists archived boolean not null default false;

drop policy if exists "Coaches can update their own form assignments" on public.form_assignments;
create policy "Coaches can update their own form assignments"
  on public.form_assignments for update
  using (auth.uid() = coach_id);

create table if not exists public.form_check_ins (
  id uuid primary key default gen_random_uuid(),
  form_assignment_id uuid not null references public.form_assignments (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  form_id uuid not null references public.form_templates (id) on delete cascade,
  scheduled_date date not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'missed')),
  archived boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  -- One occurrence per assignment per week — lets the lazy-generation
  -- step use an upsert that silently no-ops on a row that already
  -- exists, instead of needing to read-then-write every time.
  unique (form_assignment_id, scheduled_date)
);

alter table public.form_check_ins enable row level security;

drop policy if exists "Clients can view their own check-ins" on public.form_check_ins;
create policy "Clients can view their own check-ins"
  on public.form_check_ins for select
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view their clients' check-ins" on public.form_check_ins;
create policy "Coaches can view their clients' check-ins"
  on public.form_check_ins for select
  using (auth.uid() = coach_id);

-- The client's own session is what runs the lazy-generation step (same
-- "on app open" shape as the missed-workout auto-reschedule), so it's
-- the client inserting these, not the coach.
drop policy if exists "Clients can create their own check-ins" on public.form_check_ins;
create policy "Clients can create their own check-ins"
  on public.form_check_ins for insert
  with check (
    auth.uid() = client_id
    and exists (select 1 from public.form_assignments fa where fa.id = form_assignment_id and fa.client_id = auth.uid())
  );

-- Covers both directions of "update": the client marking their own
-- check-in completed, and the same client-side generation step marking
-- a stale one 'missed'/archived.
drop policy if exists "Clients can update their own check-ins" on public.form_check_ins;
create policy "Clients can update their own check-ins"
  on public.form_check_ins for update
  using (auth.uid() = client_id);

-- The coach archiving (not deleting) a completed/missed instance from
-- their own admin screen.
drop policy if exists "Coaches can update their clients' check-ins" on public.form_check_ins;
create policy "Coaches can update their clients' check-ins"
  on public.form_check_ins for update
  using (auth.uid() = coach_id);

-- Deleting is coach-only, and only ever exercised by the app on a
-- still-pending row (nothing worth preserving yet) — see
-- archiveOrDeleteCheckIn() in src/lib/form-check-ins.ts. Nothing stops
-- a direct API call from deleting a completed/missed row, same as
-- every other "the app enforces this, not the database" rule already
-- in this schema (e.g. workouts' archive-vs-delete convention).
drop policy if exists "Coaches can delete their clients' check-ins" on public.form_check_ins;
create policy "Coaches can delete their clients' check-ins"
  on public.form_check_ins for delete
  using (auth.uid() = coach_id);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_check_in_id uuid not null references public.form_check_ins (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.form_questions (id) on delete cascade,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique (form_check_in_id, question_id)
);

alter table public.form_responses enable row level security;

drop policy if exists "Clients can view their own responses" on public.form_responses;
create policy "Clients can view their own responses"
  on public.form_responses for select
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view their clients' responses" on public.form_responses;
create policy "Coaches can view their clients' responses"
  on public.form_responses for select
  using (
    exists (
      select 1 from public.form_check_ins fc where fc.id = form_check_in_id and fc.coach_id = auth.uid()
    )
  );

-- Confirms the check-in being answered is actually the client's own,
-- and the question being answered actually belongs to that check-in's
-- form — same "does this reference chain actually line up" shape
-- workout_logs' insert policy already uses.
drop policy if exists "Clients can submit their own responses" on public.form_responses;
create policy "Clients can submit their own responses"
  on public.form_responses for insert
  with check (
    auth.uid() = client_id
    and exists (
      select 1
      from public.form_check_ins fc
      join public.form_questions fq on fq.form_id = fc.form_id
      where fc.id = form_check_in_id
        and fq.id = question_id
        and fc.client_id = auth.uid()
    )
  );
