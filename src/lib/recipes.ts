import { decode } from 'base64-arraybuffer';

import type { FoodSource } from '@/lib/food-logs';
import { computeRecipeNutriScore, type NutriScoreResult } from '@/lib/nutri-score';
import { supabase } from '@/lib/supabase';

export const RECIPE_TAGS = [
  'high-protein',
  'low-carb',
  'quick',
  'meal-prep',
  'cutting-friendly',
  'bulking-friendly',
  'vegetarian',
  'vegan',
  'dairy-free',
] as const;

export type RecipeTag = (typeof RECIPE_TAGS)[number];

export type RecipeIngredient = {
  id: string;
  name: string;
  quantityGrams: number;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugars: number | null;
  saturatedFat: number | null;
  sodiumMg: number | null;
  fiber: number | null;
  fruitVegLegumeNutPercent: number | null;
  source: FoodSource;
  sourceId: string | null;
};

/** What a search result looks like right after it's picked and scaled to
 * a quantity, before it's actually saved as a row -- the same shape
 * food-logs.ts uses for `FoodLogDraft`, since this is the same "cache the
 * macros at selection time" pattern applied to a recipe instead of a log
 * entry. */
export type RecipeIngredientDraft = {
  name: string;
  quantityGrams: number;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugars: number | null;
  saturatedFat: number | null;
  sodiumMg: number | null;
  fiber: number | null;
  /** Not scaled by quantity -- a percentage of the ingredient itself,
   * same figure regardless of how many grams are used. Always a real
   * number (see FoodSearchResult.fruitVegLegumeNutPercent). */
  fruitVegLegumeNutPercent: number;
  source: FoodSource;
  sourceId: string | null;
};

export type MacroTotals = {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
};

/**
 * The one place recipe macros are ever calculated: sum every
 * ingredient's cached (already-scaled) macros, then divide by servings.
 * Deliberately pure and export-only-this-file-needs-it so it can be
 * exercised directly by a standalone verification script, independent of
 * the UI or the database -- see recipes.sql's header comment for why
 * these numbers are never stored instead of always recomputed here.
 */
export function computeMacroTotals(
  ingredients: { calories: number; protein: number | null; carbs: number | null; fat: number | null }[],
  servings: number
): MacroTotals {
  const totals = ingredients.reduce(
    (acc, ingredient) => ({
      totalCalories: acc.totalCalories + ingredient.calories,
      totalProtein: acc.totalProtein + (ingredient.protein ?? 0),
      totalCarbs: acc.totalCarbs + (ingredient.carbs ?? 0),
      totalFat: acc.totalFat + (ingredient.fat ?? 0),
    }),
    { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
  );

  return {
    ...totals,
    caloriesPerServing: totals.totalCalories / servings,
    proteinPerServing: totals.totalProtein / servings,
    carbsPerServing: totals.totalCarbs / servings,
    fatPerServing: totals.totalFat / servings,
  };
}

export type RecipeSummary = {
  id: string;
  name: string;
  servings: number;
  tags: string[];
  ingredientCount: number;
  photoUrl: string | null;
  photoStoragePath: string | null;
  /** Null once there are no ingredients yet -- there's nothing
   * meaningful to score. See computeRecipeNutriScore in nutri-score.ts
   * for how this is derived from the summed, per-serving,
   * re-normalized-to-100g ingredient totals. */
  nutriScore: NutriScoreResult | null;
} & MacroTotals;

export type RecipeDetail = RecipeSummary & {
  instructions: string;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: RecipeIngredient[];
  /** Grams per serving the Nutri-Score above was normalized against --
   * shown next to the badge so "per 100g" has a concrete meaning for
   * this specific recipe. Null alongside nutriScore when there are no
   * ingredients yet. */
  nutriScoreGramsPerServing: number | null;
};

const BUCKET = 'recipe-photos';
// Long enough to cover one screen session without needing to re-sign
// mid-visit -- same reasoning and figure as progress-photos.ts.
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

function mapIngredientRow(row: Record<string, unknown>): RecipeIngredient {
  return {
    id: row.id as string,
    name: row.name as string,
    quantityGrams: row.quantity_grams as number,
    calories: row.calories as number,
    protein: row.protein as number | null,
    carbs: row.carbs as number | null,
    fat: row.fat as number | null,
    sugars: row.sugars as number | null,
    saturatedFat: row.saturated_fat as number | null,
    sodiumMg: row.sodium_mg as number | null,
    fiber: row.fiber as number | null,
    fruitVegLegumeNutPercent: row.fruit_veg_legume_nut_percent as number | null,
    source: row.source as FoodSource,
    sourceId: row.source_id as string | null,
  };
}

/** Null once there's nothing to score yet -- see RecipeSummary.nutriScore. */
function recipeNutriScore(ingredients: RecipeIngredient[], servings: number) {
  if (ingredients.length === 0) return { nutriScore: null, gramsPerServing: null };
  const { result, gramsPerServing } = computeRecipeNutriScore(ingredients, servings);
  return { nutriScore: result, gramsPerServing };
}

async function signPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error) {
    console.error('Failed to sign recipe photo URL:', error);
    return null;
  }
  return data.signedUrl;
}

const RECIPE_INGREDIENT_NUTRIENT_COLUMNS =
  'quantity_grams, calories, protein, carbs, fat, sugars, saturated_fat, sodium_mg, fiber, fruit_veg_legume_nut_percent';

type RecipeIngredientNutrientRow = {
  quantity_grams: number;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugars: number | null;
  saturated_fat: number | null;
  sodium_mg: number | null;
  fiber: number | null;
  fruit_veg_legume_nut_percent: number | null;
};

function toNutriScoreIngredient(row: RecipeIngredientNutrientRow) {
  return {
    quantityGrams: row.quantity_grams,
    calories: row.calories,
    protein: row.protein,
    sugars: row.sugars,
    saturatedFat: row.saturated_fat,
    sodiumMg: row.sodium_mg,
    fiber: row.fiber,
    fruitVegLegumeNutPercent: row.fruit_veg_legume_nut_percent,
  };
}

export async function listRecipes(coachId: string): Promise<RecipeSummary[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(`id, name, servings, tags, photo_storage_path, recipe_ingredients (${RECIPE_INGREDIENT_NUTRIENT_COLUMNS})`)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => {
      const ingredientRows = (row.recipe_ingredients as RecipeIngredientNutrientRow[]) ?? [];
      const servings = row.servings as number;
      const nutriScoreIngredients = ingredientRows.map(toNutriScoreIngredient);
      const { nutriScore } =
        ingredientRows.length === 0
          ? { nutriScore: null }
          : { nutriScore: computeRecipeNutriScore(nutriScoreIngredients, servings).result };

      return {
        id: row.id as string,
        name: row.name as string,
        servings,
        tags: (row.tags as string[]) ?? [],
        ingredientCount: ingredientRows.length,
        photoUrl: await signPhotoUrl(row.photo_storage_path as string | null),
        photoStoragePath: row.photo_storage_path as string | null,
        nutriScore,
        ...computeMacroTotals(ingredientRows, servings),
      };
    })
  );
}

export async function getRecipeDetail(recipeId: string): Promise<RecipeDetail> {
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('id, name, servings, tags, instructions, prep_minutes, cook_minutes, photo_storage_path')
    .eq('id', recipeId)
    .single();

  if (recipeError) throw recipeError;

  const { data: ingredientRows, error: ingredientsError } = await supabase
    .from('recipe_ingredients')
    .select(
      `id, name, source, source_id, ${RECIPE_INGREDIENT_NUTRIENT_COLUMNS}`
    )
    .eq('recipe_id', recipeId)
    .order('sort_order', { ascending: true });

  if (ingredientsError) throw ingredientsError;

  const ingredients = (ingredientRows ?? []).map(mapIngredientRow);
  const servings = recipe.servings as number;
  const { nutriScore, gramsPerServing } = recipeNutriScore(ingredients, servings);

  return {
    id: recipe.id as string,
    name: recipe.name as string,
    servings,
    tags: (recipe.tags as string[]) ?? [],
    instructions: recipe.instructions as string,
    prepMinutes: recipe.prep_minutes as number,
    cookMinutes: recipe.cook_minutes as number,
    ingredientCount: ingredients.length,
    photoUrl: await signPhotoUrl(recipe.photo_storage_path as string | null),
    photoStoragePath: recipe.photo_storage_path as string | null,
    ingredients,
    nutriScore,
    nutriScoreGramsPerServing: gramsPerServing,
    ...computeMacroTotals(ingredients, servings),
  };
}

export async function createRecipe(
  coachId: string,
  fields: {
    name: string;
    instructions: string;
    prepMinutes: number;
    cookMinutes: number;
    servings: number;
    tags: string[];
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      coach_id: coachId,
      name: fields.name,
      instructions: fields.instructions,
      prep_minutes: fields.prepMinutes,
      cook_minutes: fields.cookMinutes,
      servings: fields.servings,
      tags: fields.tags,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function updateRecipeDetails(
  recipeId: string,
  fields: {
    name: string;
    instructions: string;
    prepMinutes: number;
    cookMinutes: number;
    servings: number;
    tags: string[];
  }
) {
  const { error } = await supabase
    .from('recipes')
    .update({
      name: fields.name,
      instructions: fields.instructions,
      prep_minutes: fields.prepMinutes,
      cook_minutes: fields.cookMinutes,
      servings: fields.servings,
      tags: fields.tags,
    })
    .eq('id', recipeId);

  if (error) throw error;
}

/** Removes the recipe row (ingredients cascade with it) and, best-effort,
 * its cover photo file -- a leftover orphaned file in Storage is harmless
 * clutter, not worth failing the delete over. */
export async function deleteRecipe(recipeId: string, photoStoragePath: string | null) {
  const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
  if (error) throw error;

  if (photoStoragePath) {
    await supabase.storage
      .from(BUCKET)
      .remove([photoStoragePath])
      .catch((err) => console.error('Failed to remove orphaned recipe photo:', err));
  }
}

/**
 * Uploads a new cover photo and points the recipe at it, replacing
 * whatever photo was there before. `base64` comes straight from
 * expo-image-picker's `base64: true` option -- same reasoning as
 * progress-photos.ts's `uploadProgressPhoto` for why this decodes to an
 * ArrayBuffer instead of using Blob/File/FormData.
 */
export async function uploadRecipePhoto(coachId: string, recipeId: string, base64: string) {
  const { data: current } = await supabase.from('recipes').select('photo_storage_path').eq('id', recipeId).single();
  const previousPath = current?.photo_storage_path as string | null | undefined;

  const path = `${coachId}/${recipeId}-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, decode(base64), {
    contentType: 'image/jpeg',
  });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase.from('recipes').update({ photo_storage_path: path }).eq('id', recipeId);
  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw updateError;
  }

  if (previousPath) {
    await supabase.storage
      .from(BUCKET)
      .remove([previousPath])
      .catch((err) => console.error('Failed to remove replaced recipe photo:', err));
  }
}

export async function addRecipeIngredient(recipeId: string, ingredient: RecipeIngredientDraft, sortOrder: number) {
  const { error } = await supabase.from('recipe_ingredients').insert({
    recipe_id: recipeId,
    name: ingredient.name,
    quantity_grams: ingredient.quantityGrams,
    calories: ingredient.calories,
    protein: ingredient.protein,
    carbs: ingredient.carbs,
    fat: ingredient.fat,
    sugars: ingredient.sugars,
    saturated_fat: ingredient.saturatedFat,
    sodium_mg: ingredient.sodiumMg,
    fiber: ingredient.fiber,
    fruit_veg_legume_nut_percent: ingredient.fruitVegLegumeNutPercent,
    source: ingredient.source,
    source_id: ingredient.sourceId,
    sort_order: sortOrder,
  });

  if (error) throw error;
}

export async function removeRecipeIngredient(ingredientId: string) {
  const { error } = await supabase.from('recipe_ingredients').delete().eq('id', ingredientId);
  if (error) throw error;
}
