import { supabase } from '@/lib/supabase';

export type MeasurementType = 'waist' | 'chest' | 'arms' | 'thighs' | 'hips' | 'neck';

export const MEASUREMENT_TYPES: { key: MeasurementType; label: string }[] = [
  { key: 'waist', label: 'Waist' },
  { key: 'chest', label: 'Chest' },
  { key: 'arms', label: 'Arms' },
  { key: 'thighs', label: 'Thighs' },
  { key: 'hips', label: 'Hips' },
  { key: 'neck', label: 'Neck' },
];

export type MeasurementEntry = {
  id: string;
  logDate: string;
  measurementType: MeasurementType;
  valueIn: number;
};

/** Every measurement of every type for this client, most recent first —
 * grouping by type (see groupMeasurementsByType) happens client-side so
 * this is one query no matter how many types the client has ever logged. */
export async function listBodyMeasurements(clientId: string): Promise<MeasurementEntry[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('id, log_date, measurement_type, value_in')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    logDate: row.log_date as string,
    measurementType: row.measurement_type as MeasurementType,
    valueIn: row.value_in as number,
  }));
}

/** Splits one flat list into a bucket per measurement type — every type
 * always gets an array (empty if nothing's been logged for it yet), so
 * callers never need an extra existence check before reading one out. */
export function groupMeasurementsByType(entries: MeasurementEntry[]): Record<MeasurementType, MeasurementEntry[]> {
  const grouped = Object.fromEntries(MEASUREMENT_TYPES.map((t) => [t.key, [] as MeasurementEntry[]])) as Record<
    MeasurementType,
    MeasurementEntry[]
  >;

  for (const entry of entries) {
    grouped[entry.measurementType].push(entry);
  }

  return grouped;
}

/** Inserts today's measurement of one type, or updates it in place if
 * already logged today (relies on the (client_id, log_date,
 * measurement_type) uniqueness rule) — same upsert pattern saveWeightLog
 * uses. No smoothing, no trend value: just the raw number as entered. */
export async function saveBodyMeasurement(
  clientId: string,
  logDate: string,
  measurementType: MeasurementType,
  valueIn: number
) {
  const { error } = await supabase.from('body_measurements').upsert(
    { client_id: clientId, log_date: logDate, measurement_type: measurementType, value_in: valueIn },
    { onConflict: 'client_id,log_date,measurement_type' }
  );

  if (error) throw error;
}
