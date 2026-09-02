-- Run this in the Supabase SQL Editor after community.sql.
--
-- Three pieces, required before real peer posting opens to actual
-- clients: Report, Delete, and Block.

-- 1. Report. Any signed-in user can report a post; only the coach can
--    ever read reports (this is what feeds the moderation screen) or
--    dismiss one. The unique constraint stops the same person reporting
--    the same post twice — a second attempt just fails cleanly rather
--    than piling up duplicate rows the coach has to sift through twice.
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  status text not null default 'open' check (status in ('open', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

alter table public.community_reports enable row level security;

drop policy if exists "Signed-in users can report a post" on public.community_reports;
create policy "Signed-in users can report a post"
  on public.community_reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Coaches can view all reports" on public.community_reports;
create policy "Coaches can view all reports"
  on public.community_reports for select
  using (public.is_coach());

drop policy if exists "Coaches can dismiss reports" on public.community_reports;
create policy "Coaches can dismiss reports"
  on public.community_reports for update
  using (public.is_coach());

-- 2. Delete. Two separate policies, same shape as every other
--    "author or coach" delete rule in this app (food_logs, etc.) —
--    Postgres ORs multiple permissive policies together, so either one
--    being true is enough.
drop policy if exists "Authors can delete their own community posts" on public.community_posts;
create policy "Authors can delete their own community posts"
  on public.community_posts for delete
  using (auth.uid() = author_id);

drop policy if exists "Coaches can delete any community post" on public.community_posts;
create policy "Coaches can delete any community post"
  on public.community_posts for delete
  using (public.is_coach());

-- 3. Block. A client who's blocked keeps every post they've already
--    made — nothing here touches community_posts' select policy or
--    existing rows — they just can't create a NEW one. This is a
--    dedicated table rather than a column on profiles on purpose: a
--    "profiles.community_blocked" column would need a column-level
--    UPDATE grant to let the COACH write it (the same trap
--    community_hidden almost fell into with xp.sql's lockdown), and
--    granting that column to `authenticated` at the table level would
--    ALSO let a client flip it back on THEMSELVES via the existing
--    "Users can update their own profile" row policy — there's no way
--    to grant a column to "coaches acting on someone else's row" only.
--    A separate table sidesteps that: insert/delete are gated by
--    is_coach() below, full stop, no column-grant ambiguity possible.
create table if not exists public.community_blocks (
  client_id uuid primary key references public.profiles (id) on delete cascade,
  blocked_at timestamptz not null default now()
);

alter table public.community_blocks enable row level security;

-- A client can see their own block status (so the compose screen can
-- show a plain explanation instead of a raw database error), but never
-- anyone else's.
drop policy if exists "A client can see their own block status" on public.community_blocks;
create policy "A client can see their own block status"
  on public.community_blocks for select
  using (auth.uid() = client_id);

drop policy if exists "Coaches can view all blocks" on public.community_blocks;
create policy "Coaches can view all blocks"
  on public.community_blocks for select
  using (public.is_coach());

-- Same defense-in-depth shape assignments.sql already uses for
-- coach-targets-a-client actions: not just "you're a coach," but "the
-- id you're pointing at is actually a client account."
drop policy if exists "Coaches can block a client" on public.community_blocks;
create policy "Coaches can block a client"
  on public.community_blocks for insert
  with check (
    public.is_coach()
    and exists (select 1 from public.profiles c where c.id = client_id and c.role = 'client')
  );

drop policy if exists "Coaches can unblock a client" on public.community_blocks;
create policy "Coaches can unblock a client"
  on public.community_blocks for delete
  using (public.is_coach());

-- The actual enforcement: a blocked client's insert now fails, on top
-- of the existing author-must-be-you and Announcement-is-coach-only
-- checks. Nothing about reading the feed changes for them.
drop policy if exists "Signed-in users can create their own posts" on public.community_posts;
create policy "Signed-in users can create their own posts"
  on public.community_posts for insert
  with check (
    auth.uid() = author_id
    and (tag <> 'announcement' or public.is_coach())
    and not exists (select 1 from public.community_blocks where client_id = auth.uid())
  );
