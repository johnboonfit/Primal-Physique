-- Run this in the Supabase SQL Editor after backfill-exercise-library-links.sql
-- (paste the whole file, click Run).
--
-- Form Check: replaces the toggle-only placeholder that's existed since
-- feature-toggles.sql first reserved the 'form_check' key. A client
-- records or uploads a short video of themselves performing an
-- exercise and submits it; the coach watches it and responds with
-- written feedback, optionally with their own follow-up video
-- demonstrating a correction.
--
-- One table, no threading: a submission gets exactly one coach
-- response, not an open-ended reply chain — this is a review workflow,
-- not a second chat system (that already exists, see chat.sql).
create table if not exists public.form_check_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  exercise_name text not null,
  client_note text,
  video_storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  feedback_text text,
  feedback_video_storage_path text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.form_check_submissions enable row level security;

-- The coach's per-client toggle (isFeatureEnabled('form_check')) is the
-- same UI-only gate Chat/Community/Leaderboard already use elsewhere —
-- not re-enforced here at the database level, on purpose, matching
-- every other per-client-toggle-gated feature in this app (the toggle
-- is a business/UX decision, not a security boundary; the actual
-- security boundary is "a client only ever sees their own rows,"
-- below).
drop policy if exists "Clients can view their own form check submissions" on public.form_check_submissions;
create policy "Clients can view their own form check submissions"
  on public.form_check_submissions for select
  using (client_id = auth.uid());

drop policy if exists "Clients can submit their own form checks" on public.form_check_submissions;
create policy "Clients can submit their own form checks"
  on public.form_check_submissions for insert
  with check (client_id = auth.uid() and public.is_client());

drop policy if exists "Coach can view every form check submission" on public.form_check_submissions;
create policy "Coach can view every form check submission"
  on public.form_check_submissions for select
  using (public.is_coach());

-- Only the coach can ever move a submission into 'reviewed' / write
-- feedback -- a client's own row stays read-only to them once
-- submitted, same as a check-in they've already answered.
drop policy if exists "Coach can respond to a form check submission" on public.form_check_submissions;
create policy "Coach can respond to a form check submission"
  on public.form_check_submissions for update
  using (public.is_coach())
  with check (public.is_coach());

-- Private bucket, path <client_id>/<filename> for both the client's own
-- submitted video and the coach's follow-up response video (kept
-- together under the same client, for a cleaner storage layout) -- same
-- private-bucket-plus-signed-URL shape chat-audio/chat-attachments
-- already use. There's only ever one coach account in this app (same
-- reasoning listClientChallenges()/listClientResourceLibrary() already
-- lean on), so a blanket is_coach() check is enough for the coach's own
-- read/write access, without needing a per-submission join.
insert into storage.buckets (id, name, public)
values ('form-check-videos', 'form-check-videos', false)
on conflict (id) do nothing;

drop policy if exists "Clients can upload their own form check videos" on storage.objects;
create policy "Clients can upload their own form check videos"
  on storage.objects for insert
  with check (
    bucket_id = 'form-check-videos'
    and public.is_client()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Clients can view their own form check videos" on storage.objects;
create policy "Clients can view their own form check videos"
  on storage.objects for select
  using (
    bucket_id = 'form-check-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Coach can view every form check video" on storage.objects;
create policy "Coach can view every form check video"
  on storage.objects for select
  using (bucket_id = 'form-check-videos' and public.is_coach());

drop policy if exists "Coach can upload a form check response video" on storage.objects;
create policy "Coach can upload a form check response video"
  on storage.objects for insert
  with check (bucket_id = 'form-check-videos' and public.is_coach());
