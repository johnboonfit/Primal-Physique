import { supabase } from '@/lib/supabase';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type FoodLogEntry = {
  id: string;
  meal: Meal;
  foodName: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type FoodLogDraft = {
  name: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sourceId: string | null;
};

export async function listFoodLogsForDate(clientId: string, logDate: string): Promise<FoodLogEntry[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('id, meal, food_name, calories, protein, carbs, fat')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    meal: row.meal as Meal,
    foodName: row.food_name as string,
    calories: row.calories as number,
    protein: row.protein as number | null,
    carbs: row.carbs as number | null,
    fat: row.fat as number | null,
  }));
}

/**
 * Saves a snapshot of the food's macros exactly as they were at the
 * moment it was picked from Open Food Facts — calories, protein, carbs,
 * fat, all copied in as plain numbers. `sourceId` is kept purely as a
 * record of where this came from; nothing ever reads it back to refresh
 * the numbers, so a later change to the food's real data (or the food
 * disappearing from Open Food Facts entirely) can never alter a log
 * entry that's already been saved.
 */
export async function addFoodLog(clientId: string, logDate: string, meal: Meal, food: FoodLogDraft) {
  const { error } = await supabase.from('food_logs').insert({
    client_id: clientId,
    log_date: logDate,
    meal,
    food_name: food.name,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    source: 'open_food_facts',
    source_id: food.sourceId,
  });

  if (error) throw error;
}
