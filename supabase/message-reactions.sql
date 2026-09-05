-- Run this in the Supabase SQL Editor after form-check.sql (paste the
-- whole file, click Run).
--
-- Lets either side react to an individual message with an emoji — the
-- app's own double-tap gesture opens the same curated EmojiPicker the
-- composer already uses; picking one reacts (❤️/👍 included, so "like
-- and/or heart" both fall out of the same mechanism, not a separate
-- special case). One reaction per person per message, not a stack —
-- reacting again with a different emoji replaces your own, tapping
-- your own reaction again removes it. Primary key (message_id, user_id)
-- is what actually enforces the "one each" rule, not app logic alone.
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;

-- Same "is this viewer a real participant in the conversation this
-- message belongs to" join message_hidden_for's own insert policy
-- already uses — reactions need the same check on read, since anyone
-- viewing the thread should see everyone's reactions, not just their
-- own.
drop policy if exists "Participants can view reactions" on public.message_reactions;
create policy "Participants can view reactions"
  on public.message_reactions for select
  using (
    exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_reactions.message_id
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists "You can react to a message in your own conversation" on public.message_reactions;
create policy "You can react to a message in your own conversation"
  on public.message_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_reactions.message_id
        and (c.client_id = auth.uid() or public.is_coach())
    )
  );

-- Changing your own reaction (a different emoji) — the upsert path.
drop policy if exists "You can change your own reaction" on public.message_reactions;
create policy "You can change your own reaction"
  on public.message_reactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "You can remove your own reaction" on public.message_reactions;
create policy "You can remove your own reaction"
  on public.message_reactions for delete
  using (user_id = auth.uid());

-- Realtime, same as messages.sql's own -- a reaction from the other
-- side should show up live while the thread is open, not just on next
-- focus.
alter publication supabase_realtime add table public.message_reactions;
