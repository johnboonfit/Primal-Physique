import type { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';

type IconName = keyof typeof Ionicons.glyphMap;

export type ActivityType = 'run' | 'swim' | 'bike' | 'walk' | 'row' | 'pilates' | 'stairmaster' | 'activity' | 'custom';

export const ACTIVITY_TYPES: { key: ActivityType; label: string; icon: IconName }[] = [
  { key: 'run', label: 'Run', icon: 'speedometer-outline' },
  { key: 'swim', label: 'Swim', icon: 'water-outline' },
  { key: 'bike', label: 'Bike', icon: 'bicycle-outline' },
  { key: 'walk', label: 'Walk', icon: 'walk-outline' },
  { key: 'row', label: 'Row', icon: 'boat-outline' },
  { key: 'pilates', label: 'Pilates', icon: 'body-outline' },
  { key: 'stairmaster', label: 'Stairmaster', icon: 'trending-up-outline' },
  { key: 'activity', label: 'Activity', icon: 'ellipsis-horizontal-outline' },
];

export type DistanceUnit = 'km' | 'mi';

export type ActivityLogEntry = {
  id: string;
  logDate: string;
  activityType: ActivityType;
  customLabel: string | null;
  durationMinutes: number;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
  calories: number | null;
  notes: string | null;
  createdAt: string;
};

export type ActivityLogDraft = {
  logDate: string;
  activityType: ActivityType;
  customLabel: string | null;
  durationMinutes: number;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
  calories: number | null;
  notes: string | null;
};

const ACTIVITY_LOG_COLUMNS =
  'id, log_date, activity_type, custom_label, duration_minutes, distance, distance_unit, calories, notes, created_at';

function mapActivityLogRow(row: Record<string, unknown>): ActivityLogEntry {
  return {
    id: row.id as string,
    logDate: row.log_date as string,
    activityType: row.activity_type as ActivityType,
    customLabel: row.custom_label as string | null,
    durationMinutes: row.duration_minutes as number,
    distance: row.distance as number | null,
    distanceUnit: row.distance_unit as DistanceUnit | null,
    calories: row.calories as number | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
  };
}

/** The display name for one entry -- the fixed type's label, or the
 * client's own typed-in name when activityType is 'custom'. */
export function activityLabel(activityType: ActivityType, customLabel: string | null): string {
  if (activityType === 'custom') return customLabel?.trim() || 'Custom Activity';
  return ACTIVITY_TYPES.find((type) => type.key === activityType)?.label ?? 'Activity';
}

export async function addActivityLog(clientId: string, draft: ActivityLogDraft): Promise<void> {
  const { error } = await supabase.from('activity_logs').insert({
    client_id: clientId,
    log_date: draft.logDate,
    activity_type: draft.activityType,
    custom_label: draft.customLabel,
    duration_minutes: draft.durationMinutes,
    distance: draft.distance,
    distance_unit: draft.distanceUnit,
    calories: draft.calories,
    notes: draft.notes,
  });

  if (error) throw error;
}

/** Most recent activities first -- used for the small "recently logged"
 * list under the Training tab's Log Activity card, so logging one isn't
 * a black box and a mis-tap can be deleted. */
export async function listMyActivityLogs(clientId: string, limit = 10): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select(ACTIVITY_LOG_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapActivityLogRow);
}

export async function deleteActivityLog(id: string): Promise<void> {
  const { error } = await supabase.from('activity_logs').delete().eq('id', id);
  if (error) throw error;
}
