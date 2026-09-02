import { supabase } from '@/lib/supabase';

export type ClientSummary = {
  id: string;
  email: string;
  fullName: string | null;
};

/** Every client account — this is a single-coach app (see
 * lock-coach-role.sql), so there's no per-coach roster to filter by; any
 * coach can see and act on any client, matching how assigning a workout
 * or programme already works. */
export async function listClients(): Promise<ClientSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('role', 'client')
    .order('email');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string | null,
  }));
}

export async function getClient(clientId: string): Promise<ClientSummary> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', clientId)
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    email: data.email as string,
    fullName: data.full_name as string | null,
  };
}
