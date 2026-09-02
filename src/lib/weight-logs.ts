import { supabase } from '@/lib/supabase';

export type WeightLogEntry = {
  id: string;
  logDate: string;
  weight: number;
  weightTrend: number;
};

// trend_today = (ALPHA x raw_weight_today) + ((1 - ALPHA) x trend_yesterday).
// The foundation Adaptive TDEE builds on — smooths out day-to-day noise
// (water, food volume, sodium) so what's tracked is real change, not
// scale noise.
const ALPHA = 0.15;

export async function listWeightLogs(clientId: string): Promise<WeightLogEntry[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('id, log_date, weight, weight_trend')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    logDate: row.log_date as string,
    weight: row.weight as number,
    weightTrend: row.weight_trend as number,
  }));
}

/**
 * Inserts today's weight, or updates it in place if already logged today
 * (relies on the (client_id, log_date) uniqueness rule), and computes
 * weight_trend alongside it.
 *
 * The trend is always computed fresh from whichever row is the client's
 * most recent one *before* today — never from today's own existing row,
 * so re-saving today's weight a second time doesn't chain off its own
 * earlier value. If a client hasn't logged for several days, that
 * "most recent before today" row is simply however many days old it
 * is — the gap needs no special handling, since skipped days never had
 * a row to begin with. If this is the client's very first-ever
 * weigh-in, the trend is seeded to equal the raw weight.
 */
export async function saveWeightLog(clientId: string, logDate: string, weight: number) {
  const { data: previous, error: previousError } = await supabase
    .from('weight_logs')
    .select('weight_trend')
    .eq('client_id', clientId)
    .lt('log_date', logDate)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousError) throw previousError;

  const previousTrend = previous?.weight_trend as number | undefined;
  const weightTrend = previousTrend === undefined ? weight : ALPHA * weight + (1 - ALPHA) * previousTrend;

  const { error } = await supabase
    .from('weight_logs')
    .upsert(
      { client_id: clientId, log_date: logDate, weight, weight_trend: weightTrend },
      { onConflict: 'client_id,log_date' }
    );

  if (error) throw error;
}
