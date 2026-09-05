import { supabase } from '@/lib/supabase';

export type WeightLogEntry = {
  id: string;
  logDate: string;
  weight: number;
  weightTrend: number;
  bodyFatPercent: number | null;
  musclePercent: number | null;
};

// trend_today = (ALPHA x raw_weight_today) + ((1 - ALPHA) x trend_yesterday).
// The foundation Adaptive TDEE builds on — smooths out day-to-day noise
// (water, food volume, sodium) so what's tracked is real change, not
// scale noise.
const ALPHA = 0.15;

export async function hasWeightLogForDate(clientId: string, logDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('id')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/** The single most recent weigh-in, or null if the client has never
 * logged one -- used by Home's "Weight" ring so it doesn't have to fetch
 * (and discard) the entire history just to read the newest row. */
export async function getLatestWeightLog(clientId: string): Promise<WeightLogEntry | null> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('id, log_date, weight, weight_trend, body_fat_percent, muscle_percent')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    logDate: data.log_date as string,
    weight: data.weight as number,
    weightTrend: data.weight_trend as number,
    bodyFatPercent: data.body_fat_percent as number | null,
    musclePercent: data.muscle_percent as number | null,
  };
}

export async function listWeightLogs(clientId: string): Promise<WeightLogEntry[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('id, log_date, weight, weight_trend, body_fat_percent, muscle_percent')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    logDate: row.log_date as string,
    weight: row.weight as number,
    weightTrend: row.weight_trend as number,
    bodyFatPercent: row.body_fat_percent as number | null,
    musclePercent: row.muscle_percent as number | null,
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
 *
 * bodyFatPercent/musclePercent default to `undefined`, not `null` —
 * `undefined` means "don't touch this field" (omitted from the upsert
 * payload entirely, so a conflicting row's existing value survives);
 * `null` means "clear it," same as the Metrics tab already does when the
 * client blanks that field before saving. This distinction is what lets
 * a check-in that only asks about weight (see form-check-ins.ts) sync
 * into this same table without silently wiping out body fat/muscle %
 * the client already logged for that day some other way.
 */
export async function saveWeightLog(
  clientId: string,
  logDate: string,
  weight: number,
  bodyFatPercent?: number | null,
  musclePercent?: number | null
) {
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

  const row: Record<string, unknown> = {
    client_id: clientId,
    log_date: logDate,
    weight,
    weight_trend: weightTrend,
  };
  if (bodyFatPercent !== undefined) row.body_fat_percent = bodyFatPercent;
  if (musclePercent !== undefined) row.muscle_percent = musclePercent;

  const { error } = await supabase.from('weight_logs').upsert(row, { onConflict: 'client_id,log_date' });

  if (error) throw error;
}
