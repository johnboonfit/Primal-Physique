import { supabase } from '@/lib/supabase';

export type ChallengeType = 'volume' | 'consistency';

export type CoachChallenge = {
  id: string;
  name: string;
  type: ChallengeType;
  startDate: string;
  endDate: string;
  openToAll: boolean;
  participantCount: number;
};

export type ClientChallenge = {
  id: string;
  name: string;
  type: ChallengeType;
  startDate: string;
  endDate: string;
  joined: boolean;
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Creates the challenge row, then — only when it's NOT open to
 * everyone — snapshots the picked client ids into
 * challenge_eligible_clients. Mirrors createBulkMessageSeries()'s own
 * "create the parent row, then the recipient/eligibility rows" shape
 * in bulk-messages.ts.
 */
export async function createChallenge(params: {
  coachId: string;
  name: string;
  type: ChallengeType;
  startDate: string;
  endDate: string;
  openToAll: boolean;
  eligibleClientIds: string[];
}): Promise<void> {
  const { coachId, name, type, startDate, endDate, openToAll, eligibleClientIds } = params;

  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .insert({
      coach_id: coachId,
      name,
      type,
      start_date: startDate,
      end_date: endDate,
      open_to_all: openToAll,
    })
    .select('id')
    .single();
  if (challengeError) throw challengeError;

  if (!openToAll && eligibleClientIds.length > 0) {
    const { error: eligibleError } = await supabase
      .from('challenge_eligible_clients')
      .insert(eligibleClientIds.map((clientId) => ({ challenge_id: challenge.id as string, client_id: clientId })));
    if (eligibleError) throw eligibleError;
  }
}

/** Every challenge this coach has created, most recently created first
 * — past, active, and upcoming alike, since managing one doesn't stop
 * just because its dates have passed. */
export async function listCoachChallenges(coachId: string): Promise<CoachChallenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id, name, type, start_date, end_date, open_to_all, challenge_participants(count)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as ChallengeType,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    openToAll: row.open_to_all as boolean,
    participantCount: (row.challenge_participants as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

/**
 * Active/upcoming challenges this client is eligible for — RLS already
 * scopes the result to open-to-all challenges plus anything they're
 * specifically listed for, this just also excludes anything whose
 * end_date has already passed. Merges in this client's own
 * challenge_participants rows (a separate query, then joined here in
 * JS) to know which ones they've actually joined.
 */
export async function listClientChallenges(clientId: string): Promise<ClientChallenge[]> {
  const [challengesRes, participantsRes] = await Promise.all([
    supabase
      .from('challenges')
      .select('id, name, type, start_date, end_date')
      .gte('end_date', todayISODate())
      .order('start_date', { ascending: true }),
    supabase.from('challenge_participants').select('challenge_id').eq('client_id', clientId),
  ]);

  if (challengesRes.error) throw challengesRes.error;
  if (participantsRes.error) throw participantsRes.error;

  const joinedIds = new Set((participantsRes.data ?? []).map((row) => row.challenge_id as string));

  return (challengesRes.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as ChallengeType,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    joined: joinedIds.has(row.id as string),
  }));
}

export async function joinChallenge(challengeId: string, clientId: string): Promise<void> {
  const { error } = await supabase.from('challenge_participants').insert({ challenge_id: challengeId, client_id: clientId });
  if (error) throw error;
}

export async function leaveChallenge(challengeId: string, clientId: string): Promise<void> {
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('client_id', clientId);
  if (error) throw error;
}
