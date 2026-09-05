-- Run this in the Supabase SQL Editor after challenge-progress.sql
-- (paste the whole file, click Run).
--
-- Resource Library: coach-side content sharing, replacing the empty
-- placeholder. Three tables:
--   1. resource_folders — a flat, single-level grouping label (no
--      nesting) a coach creates to organise items under, e.g.
--      "Nutrition Guides" or "Mobility". Folder NAMES aren't sensitive
--      on their own, so any client can read the folder list — the real
--      gate is on each item inside one, not the folder itself. That's
--      also why this table's own RLS never has to look at
--      resource_items, sidestepping the kind of infinite-recursion risk
--      challenges.sql had to solve with SECURITY DEFINER helpers.
--   2. resource_items — the actual thing being shared: either an
--      uploaded file (storage_path) or an external link (url), never
--      both. Same "open to all, or a specific list" audience shape
--      challenges.sql already uses. folder_id is nullable — an item
--      with no folder shows under "Uncategorized" in the app, and
--      deleting a folder un-categorises its items rather than deleting
--      them (on delete set null, not cascade).
--   3. resource_eligible_clients — the specific-clients list, only ever
--      populated when an item's open_to_all is false. Same snapshot-at-
--      creation-time shape as challenge_eligible_clients.

create table if not exists public.resource_folders (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.resource_folders enable row level security;

create table if not exists public.resource_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  folder_id uuid references public.resource_folders (id) on delete set null,
  name text not null,
  type text not null check (type in ('file', 'link')),
  storage_path text,
  file_name text,
  mime_type text,
  url text,
  open_to_all boolean not null default true,
  created_at timestamptz not null default now(),
  constraint resource_items_type_fields check (
    (type = 'file' and storage_path is not null and url is null)
    or (type = 'link' and url is not null and storage_path is null)
  )
);

alter table public.resource_items enable row level security;

create table if not exists public.resource_eligible_clients (
  resource_item_id uuid not null references public.resource_items (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  primary key (resource_item_id, client_id)
);

alter table public.resource_eligible_clients enable row level security;

-- Same reason owns_challenge()/is_eligible_for_challenge() are SECURITY
-- DEFINER in challenges.sql: resource_items' client-select policy needs
-- to check resource_eligible_clients, and resource_eligible_clients'
-- own coach-management policy needs to check resource_items right back
-- — a plain inline subquery on both sides is a genuine infinite-
-- recursion error in Postgres, not just a style choice. A SECURITY
-- DEFINER function's own internal queries bypass RLS on the tables it
-- reads, breaking that cycle.
create or replace function public.owns_resource_item(target_item_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.resource_items ri
    where ri.id = target_item_id and ri.coach_id = auth.uid()
  );
$$;

create or replace function public.is_eligible_for_resource_item(target_item_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.resource_items ri
    where ri.id = target_item_id
      and (
        ri.open_to_all
        or exists (
          select 1 from public.resource_eligible_clients e
          where e.resource_item_id = ri.id and e.client_id = auth.uid()
        )
      )
  );
$$;

drop policy if exists "Coach can manage their own resource folders" on public.resource_folders;
create policy "Coach can manage their own resource folders"
  on public.resource_folders for all
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

-- Folder names alone aren't sensitive — the actual gate is per-item,
-- below. A client not eligible for anything in a folder just never
-- sees any items under it; the app groups by folder client-side and
-- skips rendering one that comes up empty for that viewer.
drop policy if exists "Any client can view resource folders" on public.resource_folders;
create policy "Any client can view resource folders"
  on public.resource_folders for select
  using (public.is_client());

drop policy if exists "Coach can manage their own resource items" on public.resource_items;
create policy "Coach can manage their own resource items"
  on public.resource_items for all
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

drop policy if exists "A client can view resource items they're eligible for" on public.resource_items;
create policy "A client can view resource items they're eligible for"
  on public.resource_items for select
  using (public.is_client() and public.is_eligible_for_resource_item(id));

drop policy if exists "Coach can manage eligibility for their own resource items" on public.resource_eligible_clients;
create policy "Coach can manage eligibility for their own resource items"
  on public.resource_eligible_clients for all
  using (public.owns_resource_item(resource_item_id))
  with check (public.owns_resource_item(resource_item_id));

drop policy if exists "A client can see their own resource eligibility rows" on public.resource_eligible_clients;
create policy "A client can see their own resource eligibility rows"
  on public.resource_eligible_clients for select
  using (client_id = auth.uid());

-- Uploaded files live in their own private bucket, path
-- <coach_id>/<item_id>-<filename> — same private-bucket-plus-signed-URL
-- shape chat-attachments.sql already uses. The coach's own policies
-- just check the folder name (cheap, no table lookup); the eligible-
-- client policy reuses is_eligible_for_resource_item() so a file is
-- only ever readable by someone who could already see its item row.
insert into storage.buckets (id, name, public)
values ('resource-files', 'resource-files', false)
on conflict (id) do nothing;

drop policy if exists "Coach can upload their own resource files" on storage.objects;
create policy "Coach can upload their own resource files"
  on storage.objects for insert
  with check (
    bucket_id = 'resource-files'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Coach can view their own resource files" on storage.objects;
create policy "Coach can view their own resource files"
  on storage.objects for select
  using (
    bucket_id = 'resource-files'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Coach can delete their own resource files" on storage.objects;
create policy "Coach can delete their own resource files"
  on storage.objects for delete
  using (
    bucket_id = 'resource-files'
    and public.is_coach()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- storage.objects.name is unqualified everywhere else in this file
-- (there's nothing else it could mean there), but resource_items has
-- its OWN "name" column (the item's display name) — inside this
-- subquery a bare "name" resolves to resource_items.name, not
-- storage.objects.name, silently comparing a column to itself instead
-- of to the file path. Caught for real by testing this policy against
-- an actual Postgres, not just reading it back and assuming it was
-- right. Explicitly qualifying storage.objects.name fixes it.
drop policy if exists "An eligible client can view a resource file" on storage.objects;
create policy "An eligible client can view a resource file"
  on storage.objects for select
  using (
    bucket_id = 'resource-files'
    and exists (
      select 1 from public.resource_items ri
      where ri.storage_path = storage.objects.name and public.is_eligible_for_resource_item(ri.id)
    )
  );
