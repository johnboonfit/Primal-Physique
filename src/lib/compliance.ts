import { getCalorieTarget } from '@/lib/tdee';
import { supabase } from '@/lib/supabase';

/** 4 weeks, trailing, ending today. */
const COMPLIANCE_WINDOW_DAYS = 28;
/** A day's logged calories count as "adherent" within ±15% of target. */
const ADHERENCE_TOLERANCE = 0.15;

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export type ComplianceBreakdown = {
  /** 0–100, the average of the two halves below. */
  score: number;
  /** 0–1. */
  punctualityRate: number;
  /** 0–1. */
  macroAdherenceRate: number;
  checkInsScheduled: number;
  checkInsOnTime: number;
  daysInWindow: number;
  daysAdherent: number;
  /** Null when the client has no calorie target at all yet (e.g. too
   * new for a TDEE estimate) — macroAdherenceRate is full credit in
   * that case, same "nothing to miss" reasoning as an empty check-in
   * schedule. */
  targetCalories: number | null;
  windowStart: string;
  windowEnd: string;
};

/**
 * Two halves, averaged:
 *
 *   - Punctuality: of every check-in SCHEDULED in the last 4 weeks
 *     (including ones already archived as 'missed' — that's exactly
 *     why archiving never deletes them), what fraction were actually
 *     submitted (status='completed') before their own due_at. A
 *     completed-but-late submission counts against this the same as a
 *     missed one; only genuinely on-time counts for it.
 *   - Macro adherence: of the 28 calendar days in the window, what
 *     fraction had total logged calories within 15% of the client's
 *     CURRENT calorie target (getCalorieTarget — the real Adaptive
 *     TDEE number, not a separate copy of it). A day with nothing
 *     logged fails this outright, on purpose: not logging is itself
 *     non-compliant, not a neutral non-event.
 *
 * Both halves use "nothing to miss yet" as full credit rather than
 * dividing by zero or by a broken measuring stick — no check-ins ever
 * scheduled, or no calorie target ever calculated, isn't a failure,
 * it's an absence of anything to be non-compliant with. Same
 * philosophy Momentum Score's workoutRate already uses.
 *
 * Uses the client's current target uniformly across the whole window
 * rather than reconstructing which target was active on each specific
 * day — the same simplification getMomentumScore and the Nutrition tab
 * already make (everything compares against "the target," not "the
 * target as of that day"), since TDEE only recalculates roughly weekly
 * and a changed goal mid-window is the exception, not the rule.
 */
export async function getComplianceScore(clientId: string): Promise<ComplianceBreakdown> {
  const windowEnd = todayISODate();
  const windowStart = addDays(windowEnd, -(COMPLIANCE_WINDOW_DAYS - 1));

  const [checkInsResult, target, foodResult] = await Promise.all([
    supabase
      .from('form_check_ins')
      .select('due_at, status, completed_at')
      .eq('client_id', clientId)
      .gte('scheduled_date', windowStart)
      .lte('scheduled_date', windowEnd),
    getCalorieTarget(clientId),
    supabase
      .from('food_logs')
      .select('log_date, calories')
      .eq('client_id', clientId)
      .gte('log_date', windowStart)
      .lte('log_date', windowEnd),
  ]);

  if (checkInsResult.error) throw checkInsResult.error;
  if (foodResult.error) throw foodResult.error;

  const checkIns = checkInsResult.data ?? [];
  const checkInsScheduled = checkIns.length;
  const checkInsOnTime = checkIns.filter(
    (row) =>
      row.status === 'completed' &&
      row.completed_at !== null &&
      new Date(row.completed_at as string).getTime() <= new Date(row.due_at as string).getTime()
  ).length;
  const punctualityRate = checkInsScheduled === 0 ? 1 : checkInsOnTime / checkInsScheduled;

  const targetCalories = target?.targetCalories ?? null;
  let daysAdherent = COMPLIANCE_WINDOW_DAYS;

  if (targetCalories !== null) {
    const caloriesByDate = new Map<string, number>();
    for (const row of foodResult.data ?? []) {
      const logDate = row.log_date as string;
      caloriesByDate.set(logDate, (caloriesByDate.get(logDate) ?? 0) + (row.calories as number));
    }

    daysAdherent = 0;
    for (let i = 0; i < COMPLIANCE_WINDOW_DAYS; i++) {
      const date = addDays(windowStart, i);
      const total = caloriesByDate.get(date) ?? 0;
      if (Math.abs(total - targetCalories) / targetCalories <= ADHERENCE_TOLERANCE) {
        daysAdherent += 1;
      }
    }
  }

  const macroAdherenceRate = daysAdherent / COMPLIANCE_WINDOW_DAYS;
  const score = Math.round(((punctualityRate + macroAdherenceRate) / 2) * 100);

  return {
    score,
    punctualityRate,
    macroAdherenceRate,
    checkInsScheduled,
    checkInsOnTime,
    daysInWindow: COMPLIANCE_WINDOW_DAYS,
    daysAdherent,
    targetCalories,
    windowStart,
    windowEnd,
  };
}
