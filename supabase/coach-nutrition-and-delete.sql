-- Run this in the Supabase SQL Editor after calorie-target.sql.
--
-- Two things, both needed for the coach's new Nutrition panel and for
-- letting anyone delete a logged food entry:
--
--   1. food_logs gets three new policies: a coach can now SELECT any
--      client's food logs (previously only the client who logged them
--      could see them at all — not even their own coach), and both the
--      client who logged an entry AND any coach can now DELETE it.
--   2. tdee_estimates gets one new SELECT policy so a coach can see the
--      same TDEE estimate the client's own Nutrition tab already reads,
--      needed to show "actual calories vs. target" in the coach panel.
--
-- This is a single-coach app (every signup becomes a client, and any
-- coach account can already see/assign to any client — see
-- assignments.sql's "Coaches can view client profiles" policy), so
-- these follow the same "any coach, any client" shape rather than
-- scoping to a specific coach-client relationship that doesn't exist
-- anywhere else in this schema either.

drop policy if exists "Coaches can view client food logs" on public.food_logs;
create policy "Coaches can view client food logs"
  on public.food_logs for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "Clients can delete their own food logs" on public.food_logs;
create policy "Clients can delete their own food logs"
  on public.food_logs for delete
  using (auth.uid() = client_id);

drop policy if exists "Coaches can delete client food logs" on public.food_logs;
create policy "Coaches can delete client food logs"
  on public.food_logs for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));

drop policy if exists "Coaches can view client TDEE estimates" on public.tdee_estimates;
create policy "Coaches can view client TDEE estimates"
  on public.tdee_estimates for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'));
