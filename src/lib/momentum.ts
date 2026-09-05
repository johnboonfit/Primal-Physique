import { supabase } from '@/lib/supabase';

export type MomentumBreakdown = {
  /** 1–10 */
  score: number;
  workoutRate: number;
  nutritionRate: number;
  habitRate: number;
  activeDaysRate: number;
  /** True if at least one activity (a run, swim, ride, etc. -- see
   * activity-logs.ts) was logged this week -- the flat +0.5 bonus below
   * was applied. */
  activityLoggedThisWeek: boolean;
  weekStart: string;
  weekEnd: string;
};

/** Monday–Sunday for the current week, in the same UTC-based date
 * convention every other logging feature already uses (toISOString
 * slice), so week boundaries line up with how "today" is saved elsewhere.
 * Exported so other "this week" features (the Leaderboard's weekly XP
 * ranking) read the exact same Monday, not a second copy of this math
 * that could quietly drift out of sync. */
export function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export async function getMomentumScore(clientId: string): Promise<MomentumBreakdown> {
  const { start, end } = getCurrentWeekRange();

  const [assignmentsRes, foodRes, habitRes, activityRes] = await Promise.all([
    supabase
      .from('assignments')
      .select('assigned_date, status')
      .eq('client_id', clientId)
      .gte('assigned_date', start)
      .lte('assigned_date', end),
    supabase
      .from('food_logs')
      .select('log_date')
      .eq('client_id', clientId)
      .gte('log_date', start)
      .lte('log_date', end),
    supabase
      .from('habit_logs')
      .select('log_date')
      .eq('client_id', clientId)
      .gte('log_date', start)
      .lte('log_date', end),
    supabase
      .from('activity_logs')
      .select('log_date')
      .eq('client_id', clientId)
      .gte('log_date', start)
      .lte('log_date', end),
  ]);

  if (assignmentsRes.error) throw assignmentsRes.error;
  if (foodRes.error) throw foodRes.error;
  if (habitRes.error) throw habitRes.error;
  if (activityRes.error) throw activityRes.error;

  const assignments = assignmentsRes.data ?? [];
  const scheduledCount = assignments.length;
  const completedAssignments = assignments.filter((row) => row.status === 'completed');
  // No workouts scheduled this week means nothing to miss — full credit
  // for this component rather than dividing by zero.
  const workoutRate = scheduledCount === 0 ? 1 : completedAssignments.length / scheduledCount;

  const workoutDoneDays = new Set(completedAssignments.map((row) => row.assigned_date as string));
  const foodDays = new Set((foodRes.data ?? []).map((row) => row.log_date as string));
  const habitDays = new Set((habitRes.data ?? []).map((row) => row.log_date as string));
  const activityDays = new Set((activityRes.data ?? []).map((row) => row.log_date as string));

  const nutritionRate = foodDays.size / 7;
  const habitRate = habitDays.size / 7;

  // A logged activity counts as "did something today" exactly like a
  // completed workout, a logged meal, or a logged habit -- same active-day
  // treatment, no separate rate/weight of its own.
  const activeDays = new Set<string>([...workoutDoneDays, ...foodDays, ...habitDays, ...activityDays]);
  const activeDaysRate = activeDays.size / 7;

  const average = (workoutRate + nutritionRate + habitRate + activeDaysRate) / 4;
  // On top of that: a flat, capped bonus for logging an activity at all
  // this week -- not every client's programme includes cardio, so this is
  // a direct reward for optional conditioning work the other four rates
  // wouldn't otherwise recognize (folding it into activeDaysRate alone
  // wouldn't move the score on a day the client also logged food/a habit).
  const activityLoggedThisWeek = activityDays.size > 0;
  const score = Math.min(10, 1 + 9 * average + (activityLoggedThisWeek ? 0.5 : 0));

  return {
    score,
    workoutRate,
    nutritionRate,
    habitRate,
    activeDaysRate,
    activityLoggedThisWeek,
    weekStart: start,
    weekEnd: end,
  };
}
