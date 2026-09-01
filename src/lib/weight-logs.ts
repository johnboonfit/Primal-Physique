import { supabase } from '@/lib/supabase';

export type WeightLogEntry = {
  id: string;
  logDate: string;
  weight: number;
};

export async function listWeightLogs(clientId: string): Promise<WeightLogEntry[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('id, log_date, weight')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    logDate: row.log_date as string,
    weight: row.weight as number,
  }));
}

/** Inserts today's weight, or updates it in place if already logged today —
 * relies on the (client_id, log_date) uniqueness rule in the database. */
export async function saveWeightLog(clientId: string, logDate: string, weight: number) {
  const { error } = await supabase
    .from('weight_logs')
    .upsert({ client_id: clientId, log_date: logDate, weight }, { onConflict: 'client_id,log_date' });

  if (error) throw error;
}
