-- Run this in the Supabase SQL Editor after coach-notifications.sql.
--
-- Lets a client upload a real profile picture, replacing the initials
-- placeholder everywhere it shows (Settings' Hero card, and a small
-- circle next to the gear icon on the client's own Home tab). Same
-- private-bucket + path-prefix RLS shape progress-photos.sql/
-- recipes.sql already established -- "<user_id>/<filename>", so a user
-- can only ever touch files under their own folder. Not role-restricted
-- here (same as those policies) even though only the client-side UI
-- currently offers the upload button.
--
-- Every upload gets a fresh, timestamped filename rather than
-- overwriting one fixed path in place -- the previous file, if any, is
-- explicitly deleted by the app only once the new one is safely
-- recorded (see uploadAvatar() in profile-avatar.ts), so this never
-- needs an UPDATE policy on storage.objects, just select/insert/delete.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists "Users can view their own avatar file" on storage.objects;
create policy "Users can view their own avatar file"
  on storage.objects for select
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload their own avatar file" on storage.objects;
create policy "Users can upload their own avatar file"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own avatar file" on storage.objects;
create policy "Users can delete their own avatar file"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.profiles add column if not exists avatar_storage_path text;
grant update (avatar_storage_path) on public.profiles to authenticated;
