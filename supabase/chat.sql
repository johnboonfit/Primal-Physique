-- Run this in the Supabase SQL Editor after community-leaderboards.sql.
--
-- The whole messaging system, from scratch — conversations, messages
-- (text and voice), per-viewer "delete for me", real "delete for
-- everyone" (sender-only, time-limited), edit history, a private
-- storage bucket for voice clips, and a simple online/presence
-- heartbeat on profiles.
--
-- One conversation per client, not per (coach, client) pair — this is
-- a single-coach app, so "the coach" is implicit, the same
-- simplification every other feature here already makes.

-- 1. Conversations. Lazily created the first time either side opens a
--    thread — see getOrCreateConversation() in chat.ts.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

drop policy if exists "A client can view their own conversation" on public.conversations;
create policy "A client can view their own conversation"
  on public.conversations for select
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view any conversation" on public.conversations;
create policy "Coaches can view any conversation"
  on public.conversations for select
  using (public.is_coach());

-- Either side can be the one that first opens a thread and creates the
-- row — same defense-in-depth shape as every other "coach acting on a
-- client" policy in this app.
drop policy if exists "A client can create their own conversation" on public.conversations;
create policy "A client can create their own conversation"
  on public.conversations for insert
  with check (auth.uid() = client_id);

drop policy if exists "Coaches can create a conversation for a client" on public.conversations;
create policy "Coaches can create a conversation for a client"
  on public.conversations for insert
  with check (
    public.is_coach()
    and exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
  );

-- 2. Messages.
--
--    original_body is set automatically (see the trigger below) the
--    first time a message's body changes — "original isn't silently
--    lost" means it's still sitting right there in the row, not that
--    every subsequent edit is versioned.
--
--    deleted_for_everyone_at is the REAL "gone for both sides" state —
--    when set, body and audio_storage_path are cleared too, not just
--    hidden by a flag the UI happens to check. That's the genuine
--    difference from "delete for me" below, which never touches this
--    row at all.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'voice')),
  body text,
  original_body text,
  audio_storage_path text,
  audio_duration_seconds integer,
  edited_at timestamptz,
  deleted_for_everyone_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Visible to anyone who's a real participant in the conversation it
-- belongs to: the client it's with, or (any) coach.
drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

-- The real enforcement for both Edit and Delete-for-everyone in ONE
-- policy: only ever your own message (USING), and — evaluated against
-- the proposed NEW row — either this update leaves
-- deleted_for_everyone_at null (an ordinary edit, unrestricted by
-- time) or it's setting deleted_for_everyone_at while the message is
-- still within its 30-minute window. created_at can't be forged to
-- dodge that check — see the column grant below, which excludes it
-- (and sender_id/conversation_id/kind) from what a client can ever
-- touch directly.
drop policy if exists "Sender can edit or delete-for-everyone their own message" on public.messages;
create policy "Sender can edit or delete-for-everyone their own message"
  on public.messages for update
  using (auth.uid() = sender_id)
  with check (
    auth.uid() = sender_id
    and (
      deleted_for_everyone_at is null
      or created_at >= now() - interval '30 minutes'
    )
  );

-- Column-level lockdown, same shape as xp.sql's original profiles fix —
-- a client can only ever change these four columns on their own
-- message, never sender_id, conversation_id, kind, or created_at (the
-- last of which is exactly what the 30-minute check above depends on
-- staying honest).
revoke update on public.messages from authenticated;
grant update (body, original_body, edited_at, deleted_for_everyone_at, audio_storage_path) on public.messages to authenticated;

-- Captures the pre-edit text automatically, the first time (and only
-- the first time) a message's body actually changes — so the app
-- never has to fetch-then-write to know whether this is edit #1.
create or replace function public.track_message_edit()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body and old.original_body is null and old.deleted_for_everyone_at is null then
    new.original_body := old.body;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists messages_track_edit on public.messages;
create trigger messages_track_edit
  before update on public.messages
  for each row execute procedure public.track_message_edit();

-- 3. "Delete for me" — always available, either side, no time limit,
--    and never touches the shared message row at all: it's purely a
--    per-viewer suppression list. This is the actual mechanism that
--    makes it genuinely different from delete-for-everyone above,
--    not just a different label on the same action.
create table if not exists public.message_hidden_for (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_hidden_for enable row level security;

drop policy if exists "You can see your own hidden-message list" on public.message_hidden_for;
create policy "You can see your own hidden-message list"
  on public.message_hidden_for for select
  using (auth.uid() = user_id);

drop policy if exists "You can hide a message for yourself" on public.message_hidden_for;
create policy "You can hide a message for yourself"
  on public.message_hidden_for for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_hidden_for.message_id
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

-- 4. Voice messages — same private-bucket-plus-signed-URL shape as
--    progress-photos.sql, except path-based ownership here is checked
--    against conversation membership (either side can legitimately be
--    "the folder"), not a single auth.uid() folder match. Path
--    convention: <conversation_id>/<message-id-or-timestamp>.m4a.
insert into storage.buckets (id, name, public)
values ('chat-audio', 'chat-audio', false)
on conflict (id) do nothing;

drop policy if exists "Participants can view chat audio" on storage.objects;
create policy "Participants can view chat audio"
  on storage.objects for select
  using (
    bucket_id = 'chat-audio'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists "Participants can upload chat audio" on storage.objects;
create policy "Participants can upload chat audio"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-audio'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

-- 5. Real-time delivery — both new messages and edits/deletes need to
--    reach the other side live, not just on next screen focus.
alter publication supabase_realtime add table public.messages;

-- 6. A simple presence heartbeat, not a full realtime-presence
--    channel: the client app calls updateLastSeen() every so often
--    while a chat screen is open (same "check on open/while active,
--    no real background job" philosophy this app already uses for
--    TDEE recalculation and the missed-workout check). "Online" is
--    just "last_seen_at within the last couple of minutes" — a
--    heuristic computed in the app, not stored.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

grant update (last_seen_at) on public.profiles to authenticated;

-- A client has never been able to see the coach's profile row at all
-- (only the reverse) — needed now so the client's Chat screen can show
-- the coach's name and online status.
--
-- A policy on profiles can't safely query profiles directly inside
-- itself (infinite recursion — see assignments.sql's is_coach()
-- comment for the same issue on the coach side), so this needs its own
-- SECURITY DEFINER helper rather than an inline exists(...) subquery.
create or replace function public.is_client()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'client'
  );
$$;

drop policy if exists "Clients can view the coach's profile" on public.profiles;
create policy "Clients can view the coach's profile"
  on public.profiles for select
  using (role = 'coach' and public.is_client());
