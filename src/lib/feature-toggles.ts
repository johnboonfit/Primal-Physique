import { supabase } from '@/lib/supabase';

/**
 * The 9 keys feature_key.sql seeds. Only 4 of these are actually wired
 * to a real gate right now (see the "Wired" comment on each) — the rest
 * exist so the coach's toggle screen and this schema are ready the
 * moment each feature is actually built.
 */
export type FeatureKey =
  | 'form_check'
  | 'ai_create_workout'
  | 'ai_assisted_logging'
  | 'community' // Wired: community/index.tsx
  | 'challenges'
  | 'leaderboard' // Wired: leaderboard-panel.tsx
  | 'progress_photo_scanning'
  | 'momentum_score' // Wired: client/index.tsx (Momentum hero tile)
  | 'chat'; // Wired: client/chat.tsx

export type FeatureToggle = {
  key: FeatureKey;
  label: string;
  /** true unless a coach has explicitly turned this off for this
   * client — see client-feature-toggles.sql: no row means enabled. */
  enabled: boolean;
};

/**
 * Every feature key, with this client's real on/off state — a feature
 * with no row in client_feature_toggles yet defaults to enabled, so a
 * brand-new client (or a brand-new feature key added later) starts with
 * full access rather than needing 9 rows manually created first.
 */
export async function getClientFeatureToggles(clientId: string): Promise<FeatureToggle[]> {
  const [keysResult, togglesResult] = await Promise.all([
    supabase.from('feature_key').select('key, label').order('label'),
    supabase.from('client_feature_toggles').select('feature_key, enabled').eq('client_id', clientId),
  ]);

  if (keysResult.error) throw keysResult.error;
  if (togglesResult.error) throw togglesResult.error;

  const enabledByKey = new Map<string, boolean>();
  for (const row of togglesResult.data ?? []) {
    enabledByKey.set(row.feature_key as string, row.enabled as boolean);
  }

  return (keysResult.data ?? []).map((row) => ({
    key: row.key as FeatureKey,
    label: row.label as string,
    enabled: enabledByKey.get(row.key as string) ?? true,
  }));
}

/** Coach-only (enforced by RLS) — flips one client's one feature. Upsert
 * since "never toggled before" and "toggling again" are the same write. */
export async function setClientFeatureToggle(clientId: string, featureKey: FeatureKey, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('client_feature_toggles')
    .upsert({ client_id: clientId, feature_key: featureKey, enabled }, { onConflict: 'client_id,feature_key' });

  if (error) throw error;
}

/**
 * The one function the 4 gated screens actually call. True (full
 * access) unless a coach has explicitly turned this feature off for
 * this specific client — a missing row, a client checking their own
 * toggles, and a coach's toggle screen all agree on this exact
 * "no row = enabled" rule (see client-feature-toggles.sql).
 */
export async function isFeatureEnabled(clientId: string, featureKey: FeatureKey): Promise<boolean> {
  const { data, error } = await supabase
    .from('client_feature_toggles')
    .select('enabled')
    .eq('client_id', clientId)
    .eq('feature_key', featureKey)
    .maybeSingle();

  if (error) throw error;
  return data?.enabled ?? true;
}
