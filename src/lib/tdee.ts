import { supabase } from '@/lib/supabase';

const WINDOW_DAYS = 14;
const KCAL_PER_KG = 7700;

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Recomputes the Adaptive TDEE estimate for the trailing 14-day window
 * ending on `calculatedDate`, and upserts it into tdee_estimates.
 *
 * weight_logs/weight_trend are tracked in kg, matching the 7700 kcal/kg
 * constant below — no unit conversion needed.
 *
 * This does not check whether the window actually has enough data to
 * trust the result — that gate is a separate, later chunk. It only
 * bails out silently when there's truly nothing to compute from (no
 * food logged in the window, or fewer than two weight readings), since
 * that would divide by zero rather than produce a wrong-but-plausible
 * number.
 */
export async function calculateAndSaveTdee(clientId: string, calculatedDate: string) {
  const windowStart = addDays(calculatedDate, -(WINDOW_DAYS - 1));

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

  if (caloriesByDate.size === 0) return;

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
