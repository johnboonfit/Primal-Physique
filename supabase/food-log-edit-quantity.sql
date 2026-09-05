-- Run this in the Supabase SQL Editor after message-reactions.sql (paste
-- the whole file, click Run).
--
-- Lets a client edit the quantity of a food they've already logged,
-- instead of only being able to delete and re-add it. There was no
-- update policy on food_logs at all until now — only select/insert/
-- delete existed.
--
-- Column-level lockdown, same shape as chat.sql's own: a client can
-- only ever change the numbers that scale with quantity
-- (quantity_grams, calories, protein, carbs, fat) — never which
-- day/meal/food this row represents or whose it is. Editing which
-- food or which day/meal an entry belongs to still isn't a supported
-- action; that stays delete-and-re-add.
drop policy if exists "Clients can edit the quantity of their own food logs" on public.food_logs;
create policy "Clients can edit the quantity of their own food logs"
  on public.food_logs for update
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

revoke update on public.food_logs from authenticated;
grant update (quantity_grams, calories, protein, carbs, fat) on public.food_logs to authenticated;
