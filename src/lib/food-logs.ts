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

export type FoodSource = 'usda_fdc' | 'open_food_facts';

export type FoodLogDraft = {
  name: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: FoodSource;
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
 * moment it was picked — calories, protein, carbs, fat, all copied in
 * as plain numbers. `source`/`sourceId` are kept purely as a record of
 * where this came from; nothing ever reads them back to refresh the
 * numbers, so a later change to the food's real data upstream (or the
 * food disappearing from that source entirely) can never alter a log
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
    source: food.source,
    source_id: food.sourceId,
  });

  if (error) throw error;
}
