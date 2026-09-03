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
