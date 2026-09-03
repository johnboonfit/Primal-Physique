-- Run this in the Supabase SQL Editor after chat.sql.
--
-- One row per (conversation, person), holding how far that person has
-- read — not one row per message. This is the standard "read up to"
-- cursor real messaging apps use: opening a conversation and seeing
-- everything currently in it means "I've read up to right now," so a
-- single timestamp per person captures that, rather than a growing
-- per-message read table that doesn't actually buy anything for a 1:1
-- conversation.
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_reads enable row level security;

-- The whole point of a read receipt is that the OTHER person can see
-- it — so this is readable by any real participant in the
-- conversation, not just the row's own owner (unlike message_hidden_for,
-- which is deliberately private to whoever hid something).
drop policy if exists "Participants can view read receipts" on public.conversation_reads;
create policy "Participants can view read receipts"
  on public.conversation_reads for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_reads.conversation_id
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

-- But you can only ever write YOUR OWN read cursor — nobody can mark a
-- message "read" on someone else's behalf.
drop policy if exists "You can mark your own read cursor" on public.conversation_reads;
create policy "You can mark your own read cursor"
  on public.conversation_reads for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_reads.conversation_id
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists "You can update your own read cursor" on public.conversation_reads;
create policy "You can update your own read cursor"
  on public.conversation_reads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Same real-time treatment as messages — the sender's screen should
-- see "Read" appear live, not just next time they reopen the thread.
alter publication supabase_realtime add table public.conversation_reads;
