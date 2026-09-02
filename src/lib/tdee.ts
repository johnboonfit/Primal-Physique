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
