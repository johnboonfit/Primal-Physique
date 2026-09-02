import { supabase } from '@/lib/supabase';

export type HabitOption = {
  id: string;
  name: string;
  clientEmail: string;
};

export type MyHabit = {
  id: string;
  name: string;
};

export async function listCoachHabits(coachId: string): Promise<HabitOption[]> {
  const { data, error } = await supabase
    .from('habits')
    .select('id, name, profiles!client_id(email)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    clientEmail: (row.profiles as unknown as { email: string } | null)?.email ?? 'Unknown client',
  }));
}

export async function createHabit(coachId: string, clientId: string, name: string) {
  const { error } = await supabase.from('habits').insert({ coach_id: coachId, client_id: clientId, name });
  if (error) throw error;
}

export async function listMyHabits(clientId: string): Promise<MyHabit[]> {
  const { data, error } = await supabase
    .from('habits')
    .select('id, name')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MyHabit[];
}

export async function listTodaysCompletedHabitIds(clientId: string, logDate: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('habit_logs')
    .select('habit_id')
    .eq('client_id', clientId)
    .eq('log_date', logDate);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.habit_id as string));
}

/** One-directional — there's no "un-check" in this chunk, matching how
 * workout logging also can't be un-marked once completed. */
export async function completeHabit(habitId: string, clientId: string, logDate: string) {
  const { error } = await supabase.from('habit_logs').insert({ habit_id: habitId, client_id: clientId, log_date: logDate });
  if (error) throw error;
}
