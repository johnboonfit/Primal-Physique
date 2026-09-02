-- Run this in the Supabase SQL Editor after progress-photos.sql.
--
-- Three things: a single-row "app_settings" table holding the coach's
-- master Community on/off switch, a "community_posts" table for the
-- feed itself, and a private Storage bucket for optional post images.
--
-- Four fixed tags: announcement, win, pr, question. Announcement is
-- coach-only, and that restriction is enforced by the insert policy
-- below (checked against the real signed-in user's role via
-- public.is_coach(), the same function assign-programme.sql already
-- defined), not just hidden in the UI — a client account calling the
-- insert directly with tag='announcement' gets rejected by Postgres,
-- not by good manners.
--
-- reaction_count and comment_count are plain integer columns that
-- default to 0 and are shown on every post card, but there's no
-- reacting or commenting yet in this chunk — no separate tables, no way
-- to increment them, they just sit at 0. They exist now so the feed
-- card's layout doesn't have to change again the day that feature lands.

-- 1. Coach-controlled master switch. A "singleton" table: id is a
--    boolean whose only legal value is `true` (the check constraint
--    below), so this table can only ever hold exactly one row.
create table if not exists public.app_settings (
  id boolean primary key default true,
  community_enabled boolean not null default true,
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id, community_enabled)
values (true, true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Anyone signed in can view app settings" on public.app_settings;
create policy "Anyone signed in can view app settings"
  on public.app_settings for select
  using (auth.uid() is not null);

drop policy if exists "Coaches can update app settings" on public.app_settings;
create policy "Coaches can update app settings"
  on public.app_settings for update
  using (public.is_coach());

-- 2. Per-client "hide Community for me" preference — separate from the
--    coach's app-wide switch above. Rides the existing "Users can
--    update their own profile" policy from schema.sql, the same way
--    full_name did in client-name.sql — no new policy needed for
--    someone to flip their own preference.
alter table public.profiles
  add column if not exists community_hidden boolean not null default false;

-- 3. The feed itself.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  tag text not null check (tag in ('announcement', 'win', 'pr', 'question')),
  body text not null,
  image_storage_path text,
  reaction_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.community_posts enable row level security;

-- A shared feed, not a personal one — every signed-in user (coach or
-- any client) can read every post, the same "single coach, shared
-- resource" shape coach-nutrition-and-delete.sql's food-log policies
-- already establish for this single-coach app.
drop policy if exists "Anyone signed in can view community posts" on public.community_posts;
create policy "Anyone signed in can view community posts"
  on public.community_posts for select
  using (auth.uid() is not null);

-- The real enforcement: you can only post as yourself, and only a coach
-- can post an Announcement. This runs no matter what the client sends —
-- there's no client-side bypass short of getting is_coach() to lie.
drop policy if exists "Signed-in users can create their own posts" on public.community_posts;
create policy "Signed-in users can create their own posts"
  on public.community_posts for insert
  with check (
    auth.uid() = author_id
    and (tag <> 'announcement' or public.is_coach())
  );

-- 4. Optional post images — same private-bucket-plus-signed-URL shape
--    progress-photos.sql already established, except SELECT is open to
--    any signed-in user here (it's a shared feed, not personal photos)
--    while INSERT still only ever lands in your own folder.
insert into storage.buckets (id, name, public)
values ('community-images', 'community-images', false)
on conflict (id) do nothing;

drop policy if exists "Anyone signed in can view community images" on storage.objects;
create policy "Anyone signed in can view community images"
  on storage.objects for select
  using (bucket_id = 'community-images' and auth.uid() is not null);

drop policy if exists "Users can upload their own community images" on storage.objects;
create policy "Users can upload their own community images"
  on storage.objects for insert
  with check (bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text);
