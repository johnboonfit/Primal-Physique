import { supabase } from '@/lib/supabase';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type FoodLogEntry = {
  id: string;
  meal: Meal;
  foodName: string;
  calories: number;
};

export async function listFoodLogsForDate(clientId: string, logDate: string): Promise<FoodLogEntry[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('id, meal, food_name, calories')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    meal: row.meal as Meal,
    foodName: row.food_name as string,
    calories: row.calories as number,
  }));
}

export async function addFoodLog(clientId: string, logDate: string, meal: Meal, foodName: string, calories: number) {
  const { error } = await supabase.from('food_logs').insert({
    client_id: clientId,
    log_date: logDate,
    meal,
    food_name: foodName,
    calories,
  });

  if (error) throw error;
}
