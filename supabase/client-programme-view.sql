-- Run this in the Supabase SQL Editor after assign-programme.sql (paste
-- the whole file, click Run).
--
-- Two things:
--   1. Adds programme_blocks.start_date — the date the coach picked when
--      assigning, which up to now was only ever used in memory to
--      calculate session dates and then thrown away. The client's
--      Training tab needs it to work out "Week 2/6" (whole weeks elapsed
--      since the programme began), so it's persisted from here on.
--   2. Lets a client read their OWN assigned programme's structure —
--      programme_blocks and programme_weeks. Up to now only the coach
--      who created a programme could see these tables at all; a client
--      could already see the individual workouts/exercises inside their
--      assigned sessions (via the "assigned to them" policies from
--      client-access.sql), but not the programme name, description,
--      cover image, or week numbers wrapping them. Read-only — a client
--      still can't create, rename, or delete anything here.

alter table public.programme_blocks
  add column if not exists start_date date;

drop policy if exists "Clients can view their own assigned programme" on public.programme_blocks;
create policy "Clients can view their own assigned programme"
  on public.programme_blocks for select
  using (auth.uid() = client_id);

drop policy if exists "Clients can view weeks in their assigned programme" on public.programme_weeks;
create policy "Clients can view weeks in their assigned programme"
  on public.programme_weeks for select
  using (exists (select 1 from public.programme_blocks pb where pb.id = programme_id and pb.client_id = auth.uid()));
