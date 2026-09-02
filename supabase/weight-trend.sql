-- Run this in the Supabase SQL Editor after food-log-quantity.sql (order
-- relative to the other food_logs files doesn't matter — this one only
-- touches weight_logs).
--
-- Adds weight_trend: a smoothed version of the raw weight, calculated
-- as trend_today = (0.15 x raw_weight_today) + (0.85 x trend_yesterday).
-- This is the foundation Adaptive TDEE will build on — a day-to-day
-- weight reading is noisy (water, food volume, sodium), the smoothed
-- trend is what actually tracks real change over time.
--
-- Nothing here overwrites the raw `weight` column — weight_trend is a
-- new value living alongside it, one per existing row. A client never
-- logs a "trend" directly; the app always computes and writes it.
--
-- A client who skips a day simply doesn't get a row for that day (same
-- as today) — there's no weight to compute a trend from. The client's
-- NEXT real weigh-in just uses whatever trend value was last computed,
-- however many days ago that was; a 1-day gap and a 5-day gap behave
-- identically. That's the whole reason this can be expressed as "walk
-- to the next row that actually exists" rather than needing to model
-- calendar days at all.

alter table public.weight_logs
  add column if not exists weight_trend numeric;

-- One-time backfill for every row that predates this column. Walks
-- each client's history in log_date order: the first entry seeds the
-- trend with its own raw weight, and every entry after that applies the
-- smoothing formula against whichever entry came immediately before it
-- (regardless of how many calendar days separate them).
with recursive trend_calc as (
  select distinct on (client_id)
    id, client_id, log_date, weight,
    weight as weight_trend
  from public.weight_logs
  order by client_id, log_date asc

  union all

  select
    nxt.id, nxt.client_id, nxt.log_date, nxt.weight,
    (0.15 * nxt.weight) + (0.85 * tc.weight_trend) as weight_trend
  from trend_calc tc
  join lateral (
    select wl.id, wl.client_id, wl.log_date, wl.weight
    from public.weight_logs wl
    where wl.client_id = tc.client_id and wl.log_date > tc.log_date
    order by wl.log_date asc
    limit 1
  ) nxt on true
)
update public.weight_logs
set weight_trend = trend_calc.weight_trend
from trend_calc
where public.weight_logs.id = trend_calc.id;
