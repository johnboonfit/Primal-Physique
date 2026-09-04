import { supabase } from '@/lib/supabase';

/** Fitbit/Garmin/Whoop are real candidates later -- Apple Health and
 * Google Health cover the large majority of clients with relatively
 * standardized APIs, so they're the only two this schema accepts for
 * now. Adding a third provider later is a small follow-up migration
 * (widen the check constraints), not a redesign. */
export type WearableProvider = 'apple_health' | 'google_health';

export type WearableConnection = {
  provider: WearableProvider;
  connectedAt: string;
  lastSyncedAt: string | null;
};

export type WearableDailyMetrics = {
  metricDate: string;
  steps: number | null;
  restingHeartRate: number | null;
  activeCalories: number | null;
  sleepMinutes: number | null;
  source: WearableProvider;
};

export type HeartRateSample = {
  bpm: number;
  recordedAt: string;
  source: WearableProvider;
};

/** Every provider this client has ever connected -- empty until the
 * native HealthKit/Health Connect integration exists and a client
 * actually connects one (see wearables.sql's own comment for why
 * nothing writes here yet). */
export async function getWearableConnections(clientId: string): Promise<WearableConnection[]> {
  const { data, error } = await supabase
    .from('wearable_connections')
    .select('provider, connected_at, last_synced_at')
    .eq('client_id', clientId)
    .order('connected_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    provider: row.provider as WearableProvider,
    connectedAt: row.connected_at as string,
    lastSyncedAt: row.last_synced_at as string | null,
  }));
}

/** This client's synced metrics for one specific day, or null if
 * nothing's been synced for that day (every day, today included, until
 * a real sync exists). */
export async function getDailyMetricsForDate(clientId: string, metricDate: string): Promise<WearableDailyMetrics | null> {
  const { data, error } = await supabase
    .from('wearable_daily_metrics')
    .select('metric_date, steps, resting_heart_rate, active_calories, sleep_minutes, source')
    .eq('client_id', clientId)
    .eq('metric_date', metricDate)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    metricDate: data.metric_date as string,
    steps: data.steps as number | null,
    restingHeartRate: data.resting_heart_rate as number | null,
    activeCalories: data.active_calories as number | null,
    sleepMinutes: data.sleep_minutes as number | null,
    source: data.source as WearableProvider,
  };
}

// Beyond this age, a "most recent" heart rate sample is stale enough
// that showing it as this client's CURRENT heart rate during a workout
// would be misleading -- same "don't present old data as if it's live"
// rule the rest of this app follows (e.g. the calorie/macro targets
// screen's own honest "not enough history yet" states).
const HEART_RATE_FRESHNESS_MINUTES = 10;

/** The client's most recent heart rate reading, or null if there isn't
 * one at all, or the only one on record is older than
 * HEART_RATE_FRESHNESS_MINUTES -- callers (the workout logger's Heart
 * Rate row) should treat null exactly like "no wearable connected." */
export async function getLatestHeartRateSample(clientId: string): Promise<HeartRateSample | null> {
  const { data, error } = await supabase
    .from('wearable_heart_rate_samples')
    .select('bpm, recorded_at, source')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const recordedAt = data.recorded_at as string;
  const ageMinutes = (Date.now() - new Date(recordedAt).getTime()) / 60000;
  if (ageMinutes > HEART_RATE_FRESHNESS_MINUTES) return null;

  return { bpm: data.bpm as number, recordedAt, source: data.source as WearableProvider };
}

// --- Write side -----------------------------------------------------
// Nothing in this app calls these yet -- they exist so the native
// HealthKit/Health Connect sync layer (Phase B, needs a custom EAS dev
// client and a real device; see wearables.sql) has a correct, already-
// built target to write into the moment it exists, rather than that
// work also having to invent this half of the plumbing.

/** Upserts so reconnecting an already-connected provider (e.g. after
 * revoking and re-granting permission) updates the existing row
 * instead of erroring on the unique constraint. */
export async function recordWearableConnection(clientId: string, provider: WearableProvider): Promise<void> {
  const { error } = await supabase
    .from('wearable_connections')
    .upsert({ client_id: clientId, provider, connected_at: new Date().toISOString() }, { onConflict: 'client_id,provider' });

  if (error) throw error;
}

export async function recordWearableSynced(clientId: string, provider: WearableProvider): Promise<void> {
  const { error } = await supabase
    .from('wearable_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('provider', provider);

  if (error) throw error;
}

/** One day's worth of synced metrics -- upserts, since a provider might
 * resync the same day more than once (e.g. a step count that keeps
 * climbing until the day ends). Any field left out of `metrics` is
 * treated as "this provider doesn't have that figure," not zero. */
export async function saveDailyMetrics(
  clientId: string,
  metricDate: string,
  provider: WearableProvider,
  metrics: { steps?: number; restingHeartRate?: number; activeCalories?: number; sleepMinutes?: number }
): Promise<void> {
  const { error } = await supabase.from('wearable_daily_metrics').upsert(
    {
      client_id: clientId,
      metric_date: metricDate,
      source: provider,
      steps: metrics.steps ?? null,
      resting_heart_rate: metrics.restingHeartRate ?? null,
      active_calories: metrics.activeCalories ?? null,
      sleep_minutes: metrics.sleepMinutes ?? null,
    },
    { onConflict: 'client_id,metric_date' }
  );

  if (error) throw error;
}

export async function recordHeartRateSample(
  clientId: string,
  bpm: number,
  provider: WearableProvider,
  recordedAt: string = new Date().toISOString()
): Promise<void> {
  const { error } = await supabase
    .from('wearable_heart_rate_samples')
    .insert({ client_id: clientId, bpm, source: provider, recorded_at: recordedAt });

  if (error) throw error;
}
