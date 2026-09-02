import { supabase } from '@/lib/supabase';

export type MomentumBreakdown = {
  /** 1–10 */
  score: number;
  workoutRate: number;
  nutritionRate: number;
  habitRate: number;
  activeDaysRate: number;
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

  const [assignmentsRes, foodRes, habitRes] = await Promise.all([
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
  ]);

  if (assignmentsRes.error) throw assignmentsRes.error;
  if (foodRes.error) throw foodRes.error;
  if (habitRes.error) throw habitRes.error;

  const assignments = assignmentsRes.data ?? [];
  const scheduledCount = assignments.length;
  const completedAssignments = assignments.filter((row) => row.status === 'completed');
  // No workouts scheduled this week means nothing to miss — full credit
  // for this component rather than dividing by zero.
  const workoutRate = scheduledCount === 0 ? 1 : completedAssignments.length / scheduledCount;

  const workoutDoneDays = new Set(completedAssignments.map((row) => row.assigned_date as string));
  const foodDays = new Set((foodRes.data ?? []).map((row) => row.log_date as string));
  const habitDays = new Set((habitRes.data ?? []).map((row) => row.log_date as string));

  const nutritionRate = foodDays.size / 7;
  const habitRate = habitDays.size / 7;

  const activeDays = new Set<string>([...workoutDoneDays, ...foodDays, ...habitDays]);
  const activeDaysRate = activeDays.size / 7;

  const average = (workoutRate + nutritionRate + habitRate + activeDaysRate) / 4;
  const score = 1 + 9 * average;

  return {
    score,
    workoutRate,
    nutritionRate,
    habitRate,
    activeDaysRate,
    weekStart: start,
    weekEnd: end,
  };
}
