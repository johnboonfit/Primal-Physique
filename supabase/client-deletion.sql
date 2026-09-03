-- Run this in the Supabase SQL Editor after client-status.sql (paste the
-- whole file, click Run).
--
-- Permanently deleting a client is built almost entirely on a fact
-- that's already true of this schema: every personal-data table
-- (workout_logs, food_logs, weight_logs, habits, assignments,
-- messages, progress_photos, and so on) already has
-- `client_id ... references profiles (id) on delete cascade`. Deleting
-- the client's actual login (via the Supabase Admin API, in the
-- delete-client Edge Function) cascades through the whole database in
-- one atomic operation -- no separate per-table delete code needed.
--
-- community_posts is the one table that cascades the WRONG way for
-- what "permanently delete a client" should mean here: it currently
-- has `author_id ... on delete cascade`, which would silently DELETE
-- their posts along with everything else -- breaking any replies or
-- reactions other clients have on them, and erasing content that was
-- never meant to disappear just because its author's account did.
--
-- The fix is a schema change, not app logic: change that one foreign
-- key from ON DELETE CASCADE to ON DELETE SET NULL (which requires the
-- column to allow nulls first). Postgres then sets author_id to NULL
-- itself, automatically, in the same instant the client's profile is
-- deleted -- there's no separate "anonymize this post" step for the
-- Edge Function to remember, get the ordering wrong on, or skip if it
-- errors partway through. The app already treats author_id = null as
-- "Deleted user" (see community.ts) rather than trying to look up a
-- profile that's genuinely, intentionally gone.
--
-- The default constraint name below (community_posts_author_id_fkey)
-- is Postgres' standard auto-generated name for a single-column
-- `references` clause written inline in CREATE TABLE, which is exactly
-- how community.sql defined this column -- if this errors with
-- "constraint does not exist," run
-- `select conname from pg_constraint where conrelid = 'public.community_posts'::regclass and contype = 'f';`
-- to find its real name and substitute it below.

alter table public.community_posts
  drop constraint if exists community_posts_author_id_fkey;

alter table public.community_posts
  alter column author_id drop not null;

alter table public.community_posts
  add constraint community_posts_author_id_fkey
  foreign key (author_id) references public.profiles (id) on delete set null;

-- Nothing else in this file — the Edge Function (supabase/functions/
-- delete-client/) is deployed separately, through the Supabase
-- dashboard's Edge Functions tab, since it's Deno code, not SQL.
