import { supabase } from '@/lib/supabase';

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// How far back we're willing to look for a streak. Generous for how
// young this app is — nobody has a 90-day streak yet — while keeping
// the query bounded rather than pulling a client's entire history.
const LOOKBACK_DAYS = 90;

/**
 * Consecutive days ending today (or ending yesterday, if today hasn't
 * had any activity logged *yet* — the day isn't over, so it doesn't
 * break the streak until a full day passes with nothing). Two days in a
 * row with nothing (today and yesterday both empty) means it's broken.
 */
export async function getCurrentStreak(clientId: string): Promise<number> {
  const today = new Date();
  const since = toISODate(addDays(today, -LOOKBACK_DAYS));

  const [assignmentsRes, foodRes, habitRes] = await Promise.all([
    supabase
      .from('assignments')
      .select('assigned_date')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .gte('assigned_date', since),
    supabase.from('food_logs').select('log_date').eq('client_id', clientId).gte('log_date', since),
    supabase.from('habit_logs').select('log_date').eq('client_id', clientId).gte('log_date', since),
  ]);

  if (assignmentsRes.error) throw assignmentsRes.error;
  if (foodRes.error) throw foodRes.error;
  if (habitRes.error) throw habitRes.error;

  const activeDays = new Set<string>([
    ...(assignmentsRes.data ?? []).map((row) => row.assigned_date as string),
    ...(foodRes.data ?? []).map((row) => row.log_date as string),
    ...(habitRes.data ?? []).map((row) => row.log_date as string),
  ]);

  const todayStr = toISODate(today);
  const yesterdayStr = toISODate(addDays(today, -1));

  let cursor = today;
  if (!activeDays.has(todayStr)) {
    if (!activeDays.has(yesterdayStr)) return 0;
    cursor = addDays(today, -1);
  }

  let streak = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    if (!activeDays.has(toISODate(cursor))) break;
    streak++;
    cursor = addDays(cursor, -1);
  }

  return streak;
}
