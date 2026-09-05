-- Run this in the Supabase SQL Editor after chat-attachments.sql.
--
-- Coach-only bulk & scheduled messaging: pick "all clients" or any
-- subset, write one message, optionally attach a single photo/document
-- (reusing chat-attachments.sql's bucket + messages columns), and
-- either send it immediately or schedule it — once, or on a repeating
-- cadence (daily/weekly/monthly). Every send, whenever it actually
-- happens, becomes a REAL row in the recipient's own conversation via
-- messages — same table, same RLS, same realtime — a bulk message is
-- just several ordinary messages created at once, not a separate
-- inbox or notification system.
--
-- A "series" always exists, even for an instant Send Now — it's the
-- one place a coach can see every bulk send they've ever done, not
-- just the ones still pending.

create table if not exists public.bulk_message_series (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  body text not null,
  attachment_storage_path text,
  attachment_file_name text,
  attachment_mime_type text,
  repeat_cadence text not null default 'none' check (repeat_cadence in ('none', 'daily', 'weekly', 'monthly')),
  next_run_at timestamptz,
  times_fired integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.bulk_message_series enable row level security;

drop policy if exists "Coach can manage their own bulk message series" on public.bulk_message_series;
create policy "Coach can manage their own bulk message series"
  on public.bulk_message_series for all
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

-- The recipient list, snapshotted at creation — "Select All" just
-- means every client got checked off at the time you hit send, not
-- "whoever is a client whenever this fires." Predictable: what you
-- picked is who it goes to, even for a recurring series running for
-- months.
create table if not exists public.bulk_message_recipients (
  series_id uuid not null references public.bulk_message_series (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  primary key (series_id, client_id)
);

alter table public.bulk_message_recipients enable row level security;

drop policy if exists "Coach can manage recipients of their own series" on public.bulk_message_recipients;
create policy "Coach can manage recipients of their own series"
  on public.bulk_message_recipients for all
  using (exists (select 1 from public.bulk_message_series s where s.id = series_id and s.coach_id = auth.uid()))
  with check (exists (select 1 from public.bulk_message_series s where s.id = series_id and s.coach_id = auth.uid()));

-- One row per client per firing — the real record of "who actually got
-- this, and which message row is theirs." It's also what lets a
-- client view a shared bulk attachment at all (see the storage policy
-- below): nobody can see it until they've genuinely been sent
-- something that references it.
create table if not exists public.bulk_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.bulk_message_series (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.bulk_message_deliveries enable row level security;

drop policy if exists "Coach can view deliveries of their own series" on public.bulk_message_deliveries;
create policy "Coach can view deliveries of their own series"
  on public.bulk_message_deliveries for select
  using (exists (select 1 from public.bulk_message_series s where s.id = series_id and s.coach_id = auth.uid()));

drop policy if exists "A client can see their own delivery rows" on public.bulk_message_deliveries;
create policy "A client can see their own delivery rows"
  on public.bulk_message_deliveries for select
  using (client_id = auth.uid());

-- Coach's own app writes these directly for an instant Send Now (no
-- cron involved — see fireBulkMessageSeriesNow() in bulk-messages.ts);
-- the dispatcher function below writes them too, but as its
-- SECURITY DEFINER owner, which doesn't need this grant.
drop policy if exists "Coach can log deliveries for their own series" on public.bulk_message_deliveries;
create policy "Coach can log deliveries for their own series"
  on public.bulk_message_deliveries for insert
  with check (exists (select 1 from public.bulk_message_series s where s.id = series_id and s.coach_id = auth.uid()));

-- Now that bulk_message_deliveries exists, a client can be granted
-- access to a bulk attachment they were actually sent — see
-- chat-attachments.sql's "Coach can view/upload bulk chat attachments"
-- policies for the coach-side half of this same bucket path.
drop policy if exists "Recipients can view bulk chat attachments they were sent" on storage.objects;
create policy "Recipients can view bulk chat attachments they were sent"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = 'bulk'
    and exists (
      select 1 from public.bulk_message_deliveries d
      where d.series_id::text = (storage.foldername(name))[2]
        and d.client_id = auth.uid()
    )
  );

-- The actual dispatcher, for anything SCHEDULED (an instant Send Now
-- never touches this — it's already done by the time this next runs).
-- Ensures a conversation exists for every recipient (same lazy-create
-- shape as getOrCreateConversation() in chat.ts, just written in SQL
-- since this runs with nobody's session open), inserts one real
-- message per recipient, logs a delivery row, then advances the
-- series: a one-off switches itself off, a repeating one gets a
-- next_run_at exactly one cadence later — added to the OLD
-- next_run_at, not to now(), so a slow or delayed cron tick never
-- causes the schedule to drift later over time.
create or replace function public.dispatch_due_bulk_message_series()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  series record;
  recipient record;
  target_conversation_id uuid;
  new_message_id uuid;
  message_kind text;
begin
  for series in
    select * from public.bulk_message_series
    where active and next_run_at is not null and next_run_at <= now()
  loop
    message_kind := case
      when series.attachment_storage_path is null then 'text'
      when series.attachment_mime_type like 'image/%' then 'image'
      else 'file'
    end;

    for recipient in
      select client_id from public.bulk_message_recipients where series_id = series.id
    loop
      insert into public.conversations (client_id)
      values (recipient.client_id)
      on conflict (client_id) do nothing;

      select id into target_conversation_id from public.conversations where client_id = recipient.client_id;

      insert into public.messages (
        conversation_id, sender_id, kind, body,
        attachment_storage_path, attachment_file_name, attachment_mime_type
      ) values (
        target_conversation_id, series.coach_id, message_kind, series.body,
        series.attachment_storage_path, series.attachment_file_name, series.attachment_mime_type
      )
      returning id into new_message_id;

      insert into public.bulk_message_deliveries (series_id, client_id, message_id)
      values (series.id, recipient.client_id, new_message_id);
    end loop;

    update public.bulk_message_series
    set
      times_fired = times_fired + 1,
      next_run_at = case series.repeat_cadence
        when 'daily' then series.next_run_at + interval '1 day'
        when 'weekly' then series.next_run_at + interval '7 days'
        when 'monthly' then series.next_run_at + interval '1 month'
        else null
      end,
      active = series.repeat_cadence <> 'none'
    where id = series.id;
  end loop;
end;
$$;

-- pg_cron ships with every Supabase project but needs switching on
-- once. If this line errors with a permission error, enable it via
-- Dashboard -> Database -> Extensions -> pg_cron first, then re-run
-- just this file.
create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule() upserts by job name — re-running this file updates
-- the existing job in place rather than creating a duplicate one.
-- Every 15 minutes is the granularity a scheduled send actually lands
-- within; tighter than that isn't needed for check-in reminders.
select cron.schedule(
  'dispatch-bulk-message-series',
  '*/15 * * * *',
  $$select public.dispatch_due_bulk_message_series();$$
);
