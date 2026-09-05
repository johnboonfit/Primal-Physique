import { supabase } from '@/lib/supabase';

export type ClientStatus = 'active' | 'paused';

export type ClientSummary = {
  id: string;
  email: string;
  fullName: string | null;
  status: ClientStatus;
};

/** Every client account, active and paused alike — this is a
 * single-coach app (see lock-coach-role.sql), so there's no per-coach
 * roster to filter by; any coach can see and act on any client, matching
 * how assigning a workout or programme already works. Deliberately NOT
 * filtered to active-only here: this is the one shared list every coach
 * screen uses (assigning workouts, messaging, the roster itself), and a
 * paused client should still be reachable for all of those — pausing
 * only changes how they count/display (see coach-dashboard.ts's Active
 * Clients stat and the Clients screen's own badge), never who a coach
 * can act on. */
export async function listClients(): Promise<ClientSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, status')
    .eq('role', 'client')
    .order('email');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string | null,
    status: row.status as ClientStatus,
  }));
}

export async function getClient(clientId: string): Promise<ClientSummary> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, status')
    .eq('id', clientId)
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    email: data.email as string,
    fullName: data.full_name as string | null,
    status: data.status as ClientStatus,
  };
}

/**
 * Pauses or reactivates a client — fully reversible, and touches nothing
 * about their data. It's the same one-column write either direction;
 * "pause" and "reactivate" are just this function called with the other
 * value, not two different code paths. See client-status.sql for the
 * coach-only enforcement (a client can't pause/reactivate themselves).
 */
export async function setClientStatus(clientId: string, status: ClientStatus): Promise<void> {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', clientId);
  if (error) throw error;
}

/** The coach's own roster_last_viewed_at — how far back "new client"
 * counts from. Same last-viewed-timestamp shape community.ts's
 * getCommunityLastViewedAt() already established for the client side. */
export async function getRosterLastViewedAt(coachId: string): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('roster_last_viewed_at').eq('id', coachId).single();
  if (error) throw error;
  return data.roster_last_viewed_at as string;
}

/** Call the instant the Clients list actually becomes visible — same
 * "opening it and seeing what's there counts as reading it" rule
 * markCommunityViewed()/markConversationRead() already follow. */
export async function markRosterViewed(coachId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ roster_last_viewed_at: new Date().toISOString() })
    .eq('id', coachId);
  if (error) throw error;
}

/** Clients who signed up since the given timestamp — the Home
 * dashboard's "Clients" nav card badge count. */
export async function getNewClientCount(since: string): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'client')
    .gt('created_at', since);

  if (error) throw error;
  return count ?? 0;
}

/** Fires whenever a new client profile is created — the same "subscribe
 * while mounted, unsubscribe on cleanup" shape subscribeToCommunityPosts()
 * already uses for the client's Community badge. */
export function subscribeToNewClients(onChange: () => void): () => void {
  const channel = supabase
    .channel(`new-clients:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles', filter: 'role=eq.client' }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
