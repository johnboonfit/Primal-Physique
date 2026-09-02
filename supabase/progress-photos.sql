-- Run this in the Supabase SQL Editor after body-measurements-inches.sql.
--
-- Two things: a private Storage bucket to hold the actual photo files,
-- and a "progress_photos" table that records what was uploaded, when,
-- and which angle it is — the table never stores image bytes itself,
-- only a path pointing into the bucket.
--
-- Unlike weight/body-measurements, there's deliberately no
-- "(client_id, log_date, angle) unique" rule here — a client might
-- reasonably want two front photos from the same day (different
-- lighting, a retake), and forcing an upsert would silently replace one
-- with the other. Every upload is its own row.
--
-- The bucket is PRIVATE (public = false) — these are personal photos,
-- not something anyone with the file's URL should be able to view.
-- Files are stored under "<client_id>/<angle>/<filename>", and the
-- storage policies below use that path to enforce "you can only touch
-- your own folder" — the exact same shape as every other
-- "auth.uid() = client_id" rule in this app, just expressed as a path
-- check instead of a column check because Storage doesn't have columns.

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "Clients can view their own progress photo files" on storage.objects;
create policy "Clients can view their own progress photo files"
  on storage.objects for select
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Clients can upload their own progress photo files" on storage.objects;
create policy "Clients can upload their own progress photo files"
  on storage.objects for insert
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  angle text not null check (angle in ('front', 'side', 'back')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.progress_photos enable row level security;

drop policy if exists "Clients can view their own progress photos" on public.progress_photos;
create policy "Clients can view their own progress photos"
  on public.progress_photos for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can add their own progress photos" on public.progress_photos;
create policy "Clients can add their own progress photos"
  on public.progress_photos for insert
  with check (auth.uid() = client_id);
