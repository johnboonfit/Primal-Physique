import { addFoodLog, type FoodLogEntry, type FoodSource, type Meal } from '@/lib/food-logs';
import { supabase } from '@/lib/supabase';

export type SavedMealItem = {
  id: string;
  foodName: string;
  quantityGrams: number;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: FoodSource | null;
  sourceId: string | null;
};

export type SavedMeal = {
  id: string;
  name: string;
  createdAt: string;
  items: SavedMealItem[];
};

function mapItemRow(row: Record<string, unknown>): SavedMealItem {
  return {
    id: row.id as string,
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

/** Every saved meal this client has, each with its items already
 * attached -- two queries (meals, then all their items in one go),
 * merged in JS rather than a nested embed, same shape getSetPrefills
 * and other multi-table reads in this app already use. */
export async function listSavedMeals(clientId: string): Promise<SavedMeal[]> {
  const { data: meals, error: mealsError } = await supabase
    .from('saved_meals')
    .select('id, name, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (mealsError) throw mealsError;
  if (!meals || meals.length === 0) return [];

  const mealIds = meals.map((m) => m.id as string);
  const { data: items, error: itemsError } = await supabase
    .from('saved_meal_items')
    .select('id, saved_meal_id, food_name, quantity_grams, calories, protein, carbs, fat, source, source_id, sort_order')
    .in('saved_meal_id', mealIds)
    .order('sort_order', { ascending: true });

  if (itemsError) throw itemsError;

  const itemsByMealId = new Map<string, SavedMealItem[]>();
  (items ?? []).forEach((row) => {
    const mealId = row.saved_meal_id as string;
    const list = itemsByMealId.get(mealId) ?? [];
    list.push(mapItemRow(row));
    itemsByMealId.set(mealId, list);
  });

  return meals.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    items: itemsByMealId.get(row.id as string) ?? [],
  }));
}

/**
 * Bundles a set of already-logged food entries (e.g. everything under
 * Breakfast today) into a new named, reusable template -- copies each
 * entry's already-scaled macros over exactly as they are, same
 * snapshot-not-a-live-reference rule as food_logs itself. Refuses an
 * empty list rather than creating a pointless nameless-feeling template
 * with nothing in it.
 */
export async function saveMealFromEntries(clientId: string, name: string, entries: FoodLogEntry[]): Promise<void> {
  if (entries.length === 0) throw new Error('Nothing to save -- this meal has no logged items yet.');

  const { data: meal, error: mealError } = await supabase
    .from('saved_meals')
    .insert({ client_id: clientId, name })
    .select('id')
    .single();

  if (mealError) throw mealError;

  const { error: itemsError } = await supabase.from('saved_meal_items').insert(
    entries.map((entry, index) => ({
      saved_meal_id: meal.id as string,
      food_name: entry.foodName,
      quantity_grams: entry.quantityGrams,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      source: entry.source,
      source_id: entry.sourceId,
      sort_order: index,
    }))
  );

  if (itemsError) throw itemsError;
}

/** Removes a saved meal template entirely -- cascades to its items.
 * Never touches any food_logs entry that was ever logged from it; a
 * saved meal is only ever a template -- logging from it always
 * creates independent food_logs rows (see logSavedMeal). */
export async function deleteSavedMeal(savedMealId: string): Promise<void> {
  const { error } = await supabase.from('saved_meals').delete().eq('id', savedMealId);
  if (error) throw error;
}

/**
 * Logs every item in a saved meal to one date/meal slot at once --
 * exactly like adding each one by hand through the normal search flow,
 * just without re-searching or re-scaling anything, since every item
 * already carries its exact logged quantity and macros. Runs the
 * inserts in parallel; if one fails, the others that already succeeded
 * stay logged (same "no all-or-nothing transaction" shape the rest of
 * this app's multi-write flows already accept).
 */
export async function logSavedMeal(clientId: string, logDate: string, meal: Meal, savedMeal: SavedMeal): Promise<void> {
  await Promise.all(
    savedMeal.items.map((item) =>
      addFoodLog(clientId, logDate, meal, {
        name: item.foodName,
        quantityGrams: item.quantityGrams,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        // A null source only happens for an item copied from a food_logs
        // row logged before source/source_id existed at all -- picking
        // either enum value here has zero effect on anything real,
        // since it's pure provenance never read back either way.
        source: item.source ?? 'usda_fdc',
        sourceId: item.sourceId,
      })
    )
  );
}
