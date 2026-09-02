import { getActiveGoalModifier, type GoalType } from '@/lib/programmes';
import { supabase } from '@/lib/supabase';

const WINDOW_DAYS = 14;
const KCAL_PER_KG = 7700;

// Below this many logged days (out of 14) for either food or weight, the
// window is too thin to trust — calculateAndSaveTdee refuses to
// recompute, and getTdeeConfidence reports 'low'. These two intentionally
// share one threshold: "not enough data to recalculate" and "low
// confidence in what's currently shown" are the same condition.
const MIN_LOGGED_DAYS = 7;
// At or above this many logged days, the window is complete enough to
// call 'high' confidence rather than 'medium'.
const HIGH_CONFIDENCE_DAYS = 12;
// TDEE is only ever recalculated on app open, and only once this many
// days have passed since the last successful calculation — see
// checkAndRecalculateTdeeIfDue.
const RECALC_INTERVAL_DAYS = 7;

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getWindowCounts(clientId: string, windowStart: string, windowEnd: string) {
  const [foodResult, weightResult] = await Promise.all([
    supabase.from('food_logs').select('log_date').eq('client_id', clientId).gte('log_date', windowStart).lte('log_date', windowEnd),
    supabase
      .from('weight_logs')
      .select('log_date')
      .eq('client_id', clientId)
      .gte('log_date', windowStart)
      .lte('log_date', windowEnd),
  ]);

  if (foodResult.error) throw foodResult.error;
  if (weightResult.error) throw weightResult.error;

  const foodDaysLogged = new Set((foodResult.data ?? []).map((row) => row.log_date as string)).size;
  const weightDaysLogged = new Set((weightResult.data ?? []).map((row) => row.log_date as string)).size;

  return { foodDaysLogged, weightDaysLogged };
}

/**
 * Recomputes the Adaptive TDEE estimate for the trailing 14-day window
 * ending on `calculatedDate`, and upserts it into tdee_estimates — but
 * only when that window has at least MIN_LOGGED_DAYS of both food and
 * weight logs. Below that, this does nothing at all: no row is written,
 * so whatever estimate was last calculated (however old) stays exactly
 * as it was. A thin window should never silently overwrite a trustworthy
 * old number with an untrustworthy new one.
 *
 * weight_logs/weight_trend are tracked in kg, matching the 7700 kcal/kg
 * constant below — no unit conversion needed.
 */
export async function calculateAndSaveTdee(clientId: string, calculatedDate: string) {
  const windowStart = addDays(calculatedDate, -(WINDOW_DAYS - 1));

  const { foodDaysLogged, weightDaysLogged } = await getWindowCounts(clientId, windowStart, calculatedDate);
  if (foodDaysLogged < MIN_LOGGED_DAYS || weightDaysLogged < MIN_LOGGED_DAYS) return;

  const { data: foodRows, error: foodError } = await supabase
    .from('food_logs')
    .select('log_date, calories')
    .eq('client_id', clientId)
    .gte('log_date', windowStart)
    .lte('log_date', calculatedDate);

  if (foodError) throw foodError;

  const caloriesByDate = new Map<string, number>();
  for (const row of foodRows ?? []) {
    const logDate = row.log_date as string;
    caloriesByDate.set(logDate, (caloriesByDate.get(logDate) ?? 0) + (row.calories as number));
  }

  const totalCalories = [...caloriesByDate.values()].reduce((sum, value) => sum + value, 0);
  const avgDailyIntake = totalCalories / caloriesByDate.size;

  const { data: weightRows, error: weightError } = await supabase
    .from('weight_logs')
    .select('log_date, weight_trend')
    .eq('client_id', clientId)
    .gte('log_date', windowStart)
    .lte('log_date', calculatedDate)
    .order('log_date', { ascending: true });

  if (weightError) throw weightError;
  if (!weightRows || weightRows.length < 2) return;

  const trendStartKg = weightRows[0].weight_trend as number;
  const trendEndKg = weightRows[weightRows.length - 1].weight_trend as number;
  const weightChangeKg = trendEndKg - trendStartKg;

  const impliedDailyBalance = (weightChangeKg * KCAL_PER_KG) / WINDOW_DAYS;
  const estimatedTdee = avgDailyIntake - impliedDailyBalance;

  const { error } = await supabase.from('tdee_estimates').upsert(
    {
      client_id: clientId,
      calculated_date: calculatedDate,
      window_days: WINDOW_DAYS,
      avg_daily_intake: avgDailyIntake,
      weight_change_kg: weightChangeKg,
      implied_daily_balance: impliedDailyBalance,
      estimated_tdee: estimatedTdee,
    },
    { onConflict: 'client_id,calculated_date' }
  );

  if (error) throw error;
}

export type TdeeEstimate = {
  calculatedDate: string;
  estimatedTdee: number;
  avgDailyIntake: number;
  weightChangeKg: number;
};

/** Whatever was last successfully calculated — may predate today if the
 * data-quality gate above has been holding it back. */
export async function getLatestTdeeEstimate(clientId: string): Promise<TdeeEstimate | null> {
  const { data, error } = await supabase
    .from('tdee_estimates')
    .select('calculated_date, estimated_tdee, avg_daily_intake, weight_change_kg')
    .eq('client_id', clientId)
    .order('calculated_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    calculatedDate: data.calculated_date as string,
    estimatedTdee: data.estimated_tdee as number,
    avgDailyIntake: data.avg_daily_intake as number,
    weightChangeKg: data.weight_change_kg as number,
  };
}

export type TdeeConfidenceLevel = 'low' | 'medium' | 'high';

export type TdeeConfidence = {
  level: TdeeConfidenceLevel;
  windowDays: number;
  foodDaysLogged: number;
  weightDaysLogged: number;
  missedFoodLogs: number;
  missedWeighIns: number;
  /** Populated only when level is 'low' — names which log (or both) is
   * responsible, rather than leaving the client to guess. */
  reason: string | null;
};

/**
 * How trustworthy the currently-displayed TDEE estimate is, based on how
 * complete the trailing 14-day window is RIGHT NOW — independent of
 * which day that estimate actually got calculated on. If the gate above
 * is holding back a stale number because data is thin, this reports
 * 'low' for that same reason, so the UI and the gate never disagree.
 */
export async function getTdeeConfidence(clientId: string, asOfDate: string): Promise<TdeeConfidence> {
  const windowStart = addDays(asOfDate, -(WINDOW_DAYS - 1));
  const { foodDaysLogged, weightDaysLogged } = await getWindowCounts(clientId, windowStart, asOfDate);

  const limitingDays = Math.min(foodDaysLogged, weightDaysLogged);
  const level: TdeeConfidenceLevel =
    limitingDays < MIN_LOGGED_DAYS ? 'low' : limitingDays >= HIGH_CONFIDENCE_DAYS ? 'high' : 'medium';

  const missedFoodLogs = WINDOW_DAYS - foodDaysLogged;
  const missedWeighIns = WINDOW_DAYS - weightDaysLogged;

  let reason: string | null = null;
  if (level === 'low') {
    const weightShort = weightDaysLogged < MIN_LOGGED_DAYS;
    const foodShort = foodDaysLogged < MIN_LOGGED_DAYS;
    if (weightShort && foodShort) {
      reason = `${missedWeighIns} missed weigh-ins and ${missedFoodLogs} missed food logs in the last ${WINDOW_DAYS} days`;
    } else if (weightShort) {
      reason = `${missedWeighIns} missed weigh-in${missedWeighIns === 1 ? '' : 's'} in the last ${WINDOW_DAYS} days`;
    } else {
      reason = `${missedFoodLogs} missed food log${missedFoodLogs === 1 ? '' : 's'} in the last ${WINDOW_DAYS} days`;
    }
  }

  return {
    level,
    windowDays: WINDOW_DAYS,
    foodDaysLogged,
    weightDaysLogged,
    missedFoodLogs,
    missedWeighIns,
    reason,
  };
}

/**
 * Runs the same "on app open" check the missed-workout auto-reschedule
 * uses: no scheduled background job, just a look at whether it's due the
 * moment the client happens to open the app. That's a reasonable trade
 * here for the same reason it was there — with one coach and a handful
 * of clients there's no infrastructure to run or monitor a real cron job
 * for, and a target that's a day or two late to update because the
 * client didn't open the app is harmless (they just keep eating at last
 * week's number a bit longer), unlike a missed workout that actually
 * needs a same-day decision. A true weekly job only earns its keep once
 * targets need to update even when nobody opens the app.
 *
 * Does nothing if fewer than RECALC_INTERVAL_DAYS have passed since the
 * last successful calculation. Once that's satisfied, it defers entirely
 * to calculateAndSaveTdee's own data-quality gate — if the trailing
 * 14-day window still doesn't have enough logged days, nothing is
 * written and the current target keeps showing, exactly as it would if
 * fewer than 7 days had passed at all.
 */
export async function checkAndRecalculateTdeeIfDue(clientId: string, today: string) {
  const latest = await getLatestTdeeEstimate(clientId);

  if (latest) {
    const daysSinceLastCalc = Math.round(
      (new Date(`${today}T00:00:00.000Z`).getTime() - new Date(`${latest.calculatedDate}T00:00:00.000Z`).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    if (daysSinceLastCalc < RECALC_INTERVAL_DAYS) return;
  }

  await calculateAndSaveTdee(clientId, today);
}

export type CalorieTarget = {
  estimatedTdee: number;
  calculatedDate: string;
  /** Null when the client has no assigned programme yet — the target
   * still gets shown, just at a 0% (maintenance) modifier, since "no
   * active phase" isn't a reason to show nothing. */
  goalType: GoalType | null;
  modifierPercent: number;
  targetCalories: number;
};

/**
 * The client's real calorie target: their latest stored TDEE, adjusted
 * by their current phase's goal modifier. Returns null if there's no
 * TDEE estimate yet at all (not enough history logged).
 */
export async function getCalorieTarget(clientId: string): Promise<CalorieTarget | null> {
  const estimate = await getLatestTdeeEstimate(clientId);
  if (!estimate) return null;

  const goalModifier = await getActiveGoalModifier(clientId);

  return {
    estimatedTdee: estimate.estimatedTdee,
    calculatedDate: estimate.calculatedDate,
    goalType: goalModifier?.goalType ?? null,
    modifierPercent: goalModifier?.modifierPercent ?? 0,
    targetCalories: estimate.estimatedTdee * (1 + (goalModifier?.modifierPercent ?? 0) / 100),
  };
}
