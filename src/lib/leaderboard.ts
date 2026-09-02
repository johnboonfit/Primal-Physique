import { getCurrentWeekRange } from '@/lib/momentum';
import { supabase } from '@/lib/supabase';

// The stored value stays 'club' (matches client_tiers' check constraint
// and any rows already set) — only the label shown in the app changes.
export type ClientTier = 'club' | 'accelerator' | 'precision';

export const CLIENT_TIERS: { key: ClientTier; label: string }[] = [
  { key: 'club', label: 'Base' },
  { key: 'accelerator', label: 'Accelerator' },
  { key: 'precision', label: 'Precision' },
];

/** Base (the base membership, stored as 'club') doesn't unlock
 * Leaderboards — it's a premium perk on top of the two higher tiers. */
const TIERS_WITH_LEADERBOARD_ACCESS: ClientTier[] = ['accelerator', 'precision'];

export function tierHasLeaderboardAccess(tier: ClientTier): boolean {
  return TIERS_WITH_LEADERBOARD_ACCESS.includes(tier);
}

export type LeaderboardEntry = {
  clientId: string;
  name: string;
  xp: number;
};

type LeaderboardRow = { client_id: string; full_name: string | null; email: string | null; xp: number };

function toEntries(rows: LeaderboardRow[]): LeaderboardEntry[] {
  return rows.map((row) => ({
    clientId: row.client_id,
    name: row.full_name || row.email?.split('@')[0] || 'Unknown',
    xp: row.xp,
  }));
}

/**
 * This week's XP total per client, highest first — the current
 * Monday–Sunday week, same boundaries Momentum Score already uses (see
 * getCurrentWeekRange). Reads straight from the xp_events ledger via a
 * SECURITY DEFINER SQL function (get_weekly_xp_leaderboard) rather than
 * a second scoring system — the ledger is the one real source of truth
 * profiles.total_xp is itself kept in sync from.
 */
export async function getWeeklyLeaderboard(): Promise<LeaderboardEntry[]> {
  const { start, end } = getCurrentWeekRange();
  const { data, error } = await supabase.rpc('get_weekly_xp_leaderboard', { week_start: start, week_end: end });
  if (error) throw error;
  return toEntries((data ?? []) as LeaderboardRow[]);
}

/** Lifetime XP, highest first — the exact same profiles.total_xp
 * column the Home dashboard's Level/XP card already reads for one
 * client, just for every client at once here. */
export async function getLifetimeLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_lifetime_xp_leaderboard');
  if (error) throw error;
  return toEntries((data ?? []) as LeaderboardRow[]);
}

/** A client's own tier. No row yet means 'club' — the same
 * conservative "nothing set means the most restricted option, never
 * the most permissive" default client_tiers.sql documents. */
export async function getMyTier(clientId: string): Promise<ClientTier> {
  const { data, error } = await supabase.from('client_tiers').select('tier').eq('client_id', clientId).maybeSingle();
  if (error) throw error;
  return (data?.tier as ClientTier | undefined) ?? 'club';
}

/** Coach-only in practice (see client_tiers' insert/update policies) —
 * sets or changes a client's tier to match whatever they actually pay
 * for. Upsert since "first time setting this client's tier" and
 * "changing it later" are the same action from the coach's side. */
export async function setClientTier(clientId: string, tier: ClientTier): Promise<void> {
  const { error } = await supabase.from('client_tiers').upsert({ client_id: clientId, tier }, { onConflict: 'client_id' });
  if (error) throw error;
}

/** Coach-only read of every client's current tier (clients with no row
 * yet simply aren't in this map — callers should default to 'club'),
 * for the Clients list's tier control. */
export async function listClientTiers(): Promise<Record<string, ClientTier>> {
  const { data, error } = await supabase.from('client_tiers').select('client_id, tier');
  if (error) throw error;

  const map: Record<string, ClientTier> = {};
  (data ?? []).forEach((row) => {
    map[row.client_id as string] = row.tier as ClientTier;
  });
  return map;
}
