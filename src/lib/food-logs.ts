import { supabase } from '@/lib/supabase';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type FoodSource = 'usda_fdc' | 'open_food_facts';

export type FoodLogEntry = {
  id: string;
  logDate: string;
  meal: Meal;
  foodName: string;
  quantityGrams: number;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  /** Null for an entry logged before source/source_id existed on this
   * table. Kept purely as provenance -- same rule as everywhere else
   * this shows up (never used to look anything up live) -- but exposed
   * here (unlike earlier) so Saved Meals can carry it forward into a
   * saved_meal_items row without re-fetching from USDA/Open Food Facts. */
  source: FoodSource | null;
  sourceId: string | null;
};

/** All fields here are the ACTUAL scaled amounts for whatever quantity
 * was logged — not per-100g reference figures. Scaling from per-100g
 * source data to a real quantity happens before this draft is built. */
export type FoodLogDraft = {
  name: string;
  quantityGrams: number;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: FoodSource;
  sourceId: string | null;
};

function mapFoodLogRow(row: Record<string, unknown>): FoodLogEntry {
  return {
    id: row.id as string,
    logDate: row.log_date as string,
    meal: row.meal as Meal,
    foodName: row.food_name as string,
    quantityGrams: row.quantity_grams as number,
    calories: row.calories as number,
    protein: row.protein as number | null,
    carbs: row.carbs as number | null,
    fat: row.fat as number | null,
    source: row.source as FoodSource | null,
    sourceId: row.source_id as string | null,
  };
}

const FOOD_LOG_COLUMNS =
  'id, log_date, meal, food_name, quantity_grams, calories, protein, carbs, fat, source, source_id';

export async function listFoodLogsForDate(clientId: string, logDate: string): Promise<FoodLogEntry[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select(FOOD_LOG_COLUMNS)
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map(mapFoodLogRow);
}

export type DailyFoodLog = {
  logDate: string;
  entries: FoodLogEntry[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

/** A client's food log history over the trailing `days` calendar days
 * (most recent day first), grouped and totaled per day — used by the
 * coach's Nutrition panel to review actual eating against the client's
 * calorie target. Works identically whether called for the signed-in
 * client themselves or, under RLS, a coach viewing one of their clients. */
export async function listFoodLogHistory(clientId: string, days: number): Promise<DailyFoodLog[]> {
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const startDateISO = startDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('food_logs')
    .select(FOOD_LOG_COLUMNS)
    .eq('client_id', clientId)
    .gte('log_date', startDateISO)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const byDate = new Map<string, FoodLogEntry[]>();
  for (const row of data ?? []) {
    const entry = mapFoodLogRow(row);
    const existing = byDate.get(entry.logDate);
    if (existing) existing.push(entry);
    else byDate.set(entry.logDate, [entry]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([logDate, entries]) => ({
      logDate,
      entries,
      totalCalories: entries.reduce((sum, entry) => sum + entry.calories, 0),
      totalProtein: entries.reduce((sum, entry) => sum + (entry.protein ?? 0), 0),
      totalCarbs: entries.reduce((sum, entry) => sum + (entry.carbs ?? 0), 0),
      totalFat: entries.reduce((sum, entry) => sum + (entry.fat ?? 0), 0),
    }));
}

/** Removes one logged food entry. RLS decides who's actually allowed —
 * the client who logged it, or any coach — so this same call works from
 * both the client's own Nutrition tab and the coach's Nutrition panel. */
export async function deleteFoodLog(logId: string) {
  const { error } = await supabase.from('food_logs').delete().eq('id', logId);
  if (error) throw error;
}

/**
 * Saves a snapshot of the food's macros exactly as they were at the
 * moment it was picked and scaled to the logged quantity — calories,
 * protein, carbs, fat, all copied in as plain numbers already
 * multiplied out for `quantityGrams`. `source`/`sourceId` are kept
 * purely as a record of where the per-100g figures came from; nothing
 * ever reads them back to refresh the numbers, so a later change to the
 * food's real data upstream (or the food disappearing from that source
 * entirely) can never alter a log entry that's already been saved.
 */
export async function addFoodLog(clientId: string, logDate: string, meal: Meal, food: FoodLogDraft) {
  const { error } = await supabase.from('food_logs').insert({
    client_id: clientId,
    log_date: logDate,
    meal,
    food_name: food.name,
    quantity_grams: food.quantityGrams,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    source: food.source,
    source_id: food.sourceId,
  });

  if (error) throw error;
}
