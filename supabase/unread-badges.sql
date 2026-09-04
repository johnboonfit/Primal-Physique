-- Run this in the Supabase SQL Editor after notification-preferences.sql
-- (paste the whole file, click Run).
--
-- Two things for the Chat tab's unread-count badge and the Community
-- quick-link's new-post badge:
--
--   1. community_posts joins the realtime publication. Chat's messages
--      and conversation_reads were already added to it (see chat.sql /
--      chat-read-receipts.sql) -- community_posts never needed it until
--      now, since nothing previously needed to react live to a new
--      post. Both badges reuse this same existing realtime
--      infrastructure, not a new mechanism.
--
--   2. profiles.community_last_viewed_at -- new self-editable column,
--      same pattern every other simple per-user preference on this
--      table already uses (community_hidden, last_seen_at). Defaults to
--      now() rather than null: a null default would make every
--      existing client's badge show every post ever made as "new" the
--      moment this ships, which would be actively misleading (they've
--      already seen most of those). now() means only posts made from
--      this point forward count -- for both existing accounts (backfilled
--      to the moment this migration runs) and brand new signups
--      (defaulted to the moment their profile row is created, so
--      nothing posted before they even joined counts as new either).
--
-- Chat's own unread count needs no equivalent new column --
-- conversation_reads already exists and already means exactly "how far
-- this person has read," with no retroactive-badge problem: a
-- conversation that already existed before this chunk either already
-- has a real last_read_at (if the client ever opened Chat) or
-- correctly has none yet (if they never have), and either way the
-- count comes out right without any backfill.

alter publication supabase_realtime add table public.community_posts;

alter table public.profiles
  add column if not exists community_last_viewed_at timestamptz not null default now();

grant update (community_last_viewed_at) on public.profiles to authenticated;
