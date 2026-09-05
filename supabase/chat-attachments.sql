-- Run this in the Supabase SQL Editor after chat.sql (and before
-- bulk-messages.sql, which reuses the bucket and columns this creates).
--
-- Lets either side attach a photo or a document to a chat message —
-- same private-bucket-plus-signed-URL shape chat.sql already uses for
-- voice notes, just generalized to any file kind instead of only
-- .m4a audio.

alter table public.messages
  drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check check (kind in ('text', 'voice', 'image', 'file'));

alter table public.messages
  add column if not exists attachment_storage_path text,
  add column if not exists attachment_file_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes integer;

-- Additive to chat.sql's own "grant update (...)" on messages — Postgres
-- column grants accumulate across multiple GRANT statements, so this
-- doesn't need to repeat the columns chat.sql already granted.
grant update (attachment_storage_path, attachment_file_name, attachment_mime_type, attachment_size_bytes)
  on public.messages to authenticated;

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Ordinary 1:1 chat attachments: <conversation_id>/<filename> — same
-- membership check as chat-audio's own policies in chat.sql.
drop policy if exists "Participants can view chat attachments" on storage.objects;
create policy "Participants can view chat attachments"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists "Participants can upload chat attachments" on storage.objects;
create policy "Participants can upload chat attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

-- Bulk-message attachments: bulk/<series_id>/<filename> — ONE shared
-- file, referenced by every recipient's own message row instead of a
-- separate upload per client. The coach who composed the series can
-- always see/upload it; see bulk-messages.sql for the matching
-- recipient-side policy (it can't live here — it needs to check
-- bulk_message_deliveries, which doesn't exist until that migration
-- runs).
drop policy if exists "Coach can view bulk chat attachments" on storage.objects;
create policy "Coach can view bulk chat attachments"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = 'bulk'
    and public.is_coach()
  );

drop policy if exists "Coach can upload bulk chat attachments" on storage.objects;
create policy "Coach can upload bulk chat attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = 'bulk'
    and public.is_coach()
  );
