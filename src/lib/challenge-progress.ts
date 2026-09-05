import type { ChallengeType } from '@/lib/challenges';
import { supabase } from '@/lib/supabase';

export type ChallengeProgressEntry = {
  clientId: string;
  name: string;
  progress: number;
};

type ChallengeLeaderboardRow = { client_id: string; full_name: string | null; email: string | null; progress: number };

function toEntries(rows: ChallengeLeaderboardRow[]): ChallengeProgressEntry[] {
  return rows.map((row) => ({
    clientId: row.client_id,
    name: row.full_name || row.email?.split('@')[0] || 'Unknown',
    progress: Number(row.progress),
  }));
}

/**
 * Every participant's real progress for one challenge, ranked highest
 * first — a Volume challenge sums weight x reps from every set logged
 * within the challenge's own date range, a Consistency challenge counts
 * completed sessions in that same range. Reads through a SECURITY
 * DEFINER function (get_challenge_leaderboard, in challenge-progress.sql)
 * since ranking every participant means reading across clients, the
 * same reason getWeeklyLeaderboard()/getLifetimeLeaderboard() do.
 */
export async function getChallengeLeaderboard(challengeId: string): Promise<ChallengeProgressEntry[]> {
  const { data, error } = await supabase.rpc('get_challenge_leaderboard', { target_challenge_id: challengeId });
  if (error) throw error;
  return toEntries((data ?? []) as ChallengeLeaderboardRow[]);
}

/** True once a challenge's end date has passed. Progress genuinely can't
 * change after that — get_challenge_leaderboard only ever counts logs
 * inside [start_date, end_date], so the challenge already locks itself
 * at the database level — this is purely the UI's cue to show "Final
 * Standings" instead of "Live Standings". */
export function isChallengeLocked(endDate: string): boolean {
  return endDate < new Date().toISOString().slice(0, 10);
}

export function formatChallengeProgress(type: ChallengeType, progress: number): string {
  const rounded = Math.round(progress);
  if (type === 'volume') return `${rounded.toLocaleString()} kg lifted`;
  return `${rounded} session${rounded === 1 ? '' : 's'} completed`;
}

/**
 * Fires on every set logged, edited, or removed, and on every challenge
 * join/leave — any of those can change a challenge's standings. Same
 * unique-channel-per-subscription shape subscribeToConversation
 * (chat.ts) already uses, for the same reason: a channel name is just a
 * client-side handle, not what scopes which rows arrive, so giving each
 * call its own random suffix avoids the "cannot add postgres_changes
 * callbacks after subscribe()" collision if a challenge screen is ever
 * open in two places at once.
 *
 * Neither workout_logs nor challenge_participants carries a challenge_id
 * column, so there's no server-side filter to scope this to just one
 * challenge — this refetches on any change anywhere and lets
 * get_challenge_leaderboard()'s own WHERE clause decide what's actually
 * relevant, the same broad-subscribe-then-narrow-refetch shape
 * subscribeToCommunityPosts() already uses for community_posts.
 */
export function subscribeToChallengeProgress(onChange: () => void): () => void {
  const channel = supabase
    .channel(`challenge-progress:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_participants' }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
