-- Run this in the Supabase SQL Editor after plan-upgrades.sql (paste
-- the whole file, click Run).
--
-- Three coach-side notification badges, same "last-viewed timestamp +
-- realtime" pattern unread-badges.sql already established for the
-- client's Chat/Community badges:
--
--   1. New client added to the roster -- profiles.roster_last_viewed_at
--      (new self-editable column, on the coach's own row), compared
--      against every other profile's created_at.
--   2. New chat message -- no new column needed. conversation_reads
--      already means exactly "how far this person has read," per
--      conversation, and is already on the realtime publication (see
--      chat.sql/chat-read-receipts.sql) -- this just aggregates that
--      same data across every conversation the coach is in, instead of
--      one conversation at a time like getUnreadMessageCount() already
--      does for the client's own Chat badge.
--   3. New check-in completion -- profiles.checkins_last_viewed_at (new
--      self-editable column), compared against form_check_ins' own
--      completed_at.
--
-- Both new columns default to now(), not null, for the same reason
-- community_last_viewed_at does: a null default would make every
-- existing client and every already-completed check-in show up as
-- "new" the moment this ships, which would be actively misleading.

alter table public.profiles
  add column if not exists roster_last_viewed_at timestamptz not null default now();
alter table public.profiles
  add column if not exists checkins_last_viewed_at timestamptz not null default now();

grant update (roster_last_viewed_at, checkins_last_viewed_at) on public.profiles to authenticated;

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.form_check_ins;
