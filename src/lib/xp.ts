import { supabase } from '@/lib/supabase';

export type XpReason = 'workout_completed' | 'meal_logged' | 'habit_completed' | 'active_day_bonus';

const XP_VALUES: Record<XpReason, number> = {
  workout_completed: 50,
  meal_logged: 10,
  habit_completed: 5,
  active_day_bonus: 15,
};

// Postgres's error code for "unique constraint violation" — this is
// exactly what fires when we try to award XP for something that's
// already been awarded (e.g. a second meal the same day). That's not a
// real error, it's the "already got that one" case, so we swallow it.
const DUPLICATE_KEY_ERROR = '23505';

type XpEventRow = {
  client_id: string;
  amount: number;
  reason: XpReason;
  event_date: string;
  assignment_id?: string;
  habit_id?: string;
};

async function insertXpEvent(row: XpEventRow) {
  const { error } = await supabase.from('xp_events').insert(row);
  if (error && error.code !== DUPLICATE_KEY_ERROR) {
    throw error;
  }
}

/** Checks whether all three of workout/meal/habit have already been
 * logged for this exact day, and if so, awards the once-per-day bonus.
 * Safe to call after every individual award — it silently does nothing
 * unless this call is the one that completes the trio. */
async function maybeAwardActiveDayBonus(clientId: string, eventDate: string) {
  const { data, error } = await supabase
    .from('xp_events')
    .select('reason')
    .eq('client_id', clientId)
    .eq('event_date', eventDate);

  if (error) throw error;

  const reasons = new Set((data ?? []).map((row) => row.reason as XpReason));
  const hasAllThree =
    reasons.has('workout_completed') && reasons.has('meal_logged') && reasons.has('habit_completed');

  if (!hasAllThree) return;

  await insertXpEvent({
    client_id: clientId,
    amount: XP_VALUES.active_day_bonus,
    reason: 'active_day_bonus',
    event_date: eventDate,
  });
}

/** Call after successfully marking an assignment complete. eventDate is
 * the day it was actually completed (today), not the day it was
 * originally scheduled for. */
export async function awardWorkoutXp(clientId: string, assignmentId: string, eventDate: string) {
  await insertXpEvent({
    client_id: clientId,
    amount: XP_VALUES.workout_completed,
    reason: 'workout_completed',
    event_date: eventDate,
    assignment_id: assignmentId,
  });
  await maybeAwardActiveDayBonus(clientId, eventDate);
}

/** Call after successfully saving a food log entry. Only the first
 * successful call each day actually awards anything — the database's
 * uniqueness rule silently rejects the rest. */
export async function awardMealXp(clientId: string, eventDate: string) {
  await insertXpEvent({
    client_id: clientId,
    amount: XP_VALUES.meal_logged,
    reason: 'meal_logged',
    event_date: eventDate,
  });
  await maybeAwardActiveDayBonus(clientId, eventDate);
}

/** Call after successfully checking off a habit for today. */
export async function awardHabitXp(clientId: string, habitId: string, eventDate: string) {
  await insertXpEvent({
    client_id: clientId,
    amount: XP_VALUES.habit_completed,
    reason: 'habit_completed',
    event_date: eventDate,
    habit_id: habitId,
  });
  await maybeAwardActiveDayBonus(clientId, eventDate);
}

export type XpSummary = {
  totalXp: number;
  level: number;
};

/** Level 1 spans 0–499 XP, level 2 spans 500–999, and so on — floor(xp
 * / 500), plus 1 so a brand-new account with 0 XP is level 1, not 0. */
export function levelForXp(totalXp: number): number {
  return Math.floor(totalXp / 500) + 1;
}

export async function getXpSummary(clientId: string): Promise<XpSummary> {
  const { data, error } = await supabase.from('profiles').select('total_xp').eq('id', clientId).single();
  if (error) throw error;

  const totalXp = (data?.total_xp as number | null) ?? 0;
  return { totalXp, level: levelForXp(totalXp) };
}
