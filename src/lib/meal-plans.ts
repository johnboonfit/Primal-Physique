import { getRecipeDetail, listRecipes, type RecipeIngredient, type RecipeSummary } from '@/lib/recipes';
import { getCalorieTarget } from '@/lib/tdee';
import type { GoalType } from '@/lib/programmes';
import { supabase } from '@/lib/supabase';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEAL_SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

export type MealPlanTemplateItem = {
  id: string;
  mealSlot: MealSlot;
  servings: number;
  recipeId: string;
  recipeName: string;
  /** How many servings the recipe itself yields in total -- needed to
   * turn "servings of this recipe in this slot" into an actual fraction
   * of the recipe's ingredient list. */
  recipeServings: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
};

export type MealPlanTotals = {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  /** The template's ACTUAL macro split, as a % of calories -- compared
   * against the coach's stated target split so they can see whether the
   * recipes they picked actually hit the ratio they were aiming for.
   * Uniform scaling can't change this number, so if it's off at
   * baseline it stays off after scaling too (see scaleMealPlan). */
  actualProteinPercent: number;
  actualCarbPercent: number;
  actualFatPercent: number;
};

/**
 * The template's baseline, computed fresh every time rather than stored
 * anywhere -- same "never store what can be recomputed" rule this app
 * already applies to recipe macros (computeMacroTotals) and Nutri-Score
 * (computeNutriScore). Whatever recipes and servings a coach puts into a
 * template, THIS is its real baseline calorie total; there's no separate
 * manually-typed number that could drift from it.
 */
export function computeMealPlanTotals(
  items: { servings: number; caloriesPerServing: number; proteinPerServing: number; carbsPerServing: number; fatPerServing: number }[]
): MealPlanTotals {
  const totals = items.reduce(
    (acc, item) => ({
      totalCalories: acc.totalCalories + item.caloriesPerServing * item.servings,
      totalProtein: acc.totalProtein + item.proteinPerServing * item.servings,
      totalCarbs: acc.totalCarbs + item.carbsPerServing * item.servings,
      totalFat: acc.totalFat + item.fatPerServing * item.servings,
    }),
    { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
  );

  // Standard Atwater factors (protein/carbs = 4 kcal/g, fat = 9 kcal/g)
  // -- the macro-calorie sum, not totalCalories itself, is the
  // denominator here so these three percentages are directly comparable
  // to a target split that's defined to sum to 100.
  const proteinCalories = totals.totalProtein * 4;
  const carbCalories = totals.totalCarbs * 4;
  const fatCalories = totals.totalFat * 9;
  const macroCalories = proteinCalories + carbCalories + fatCalories;

  return {
    ...totals,
    actualProteinPercent: macroCalories > 0 ? Math.round((proteinCalories / macroCalories) * 100) : 0,
    actualCarbPercent: macroCalories > 0 ? Math.round((carbCalories / macroCalories) * 100) : 0,
    actualFatPercent: macroCalories > 0 ? Math.round((fatCalories / macroCalories) * 100) : 0,
  };
}

export type MealPlanTemplateSummary = {
  id: string;
  name: string;
  goalType: GoalType;
  targetProteinPercent: number;
  targetCarbPercent: number;
  targetFatPercent: number;
  itemCount: number;
} & MealPlanTotals;

export type MealPlanTemplateDetail = MealPlanTemplateSummary & {
  itemsBySlot: Record<MealSlot, MealPlanTemplateItem[]>;
};

async function fetchRecipeSummaryMap(coachId: string): Promise<Map<string, RecipeSummary>> {
  const recipes = await listRecipes(coachId);
  return new Map(recipes.map((recipe) => [recipe.id, recipe]));
}

function toTemplateItem(
  row: { id: string; meal_slot: string; recipe_id: string; servings: number },
  recipeMap: Map<string, RecipeSummary>
): MealPlanTemplateItem {
  const recipe = recipeMap.get(row.recipe_id);
  return {
    id: row.id,
    mealSlot: row.meal_slot as MealSlot,
    servings: row.servings,
    recipeId: row.recipe_id,
    recipeName: recipe?.name ?? 'Unknown recipe',
    recipeServings: recipe?.servings ?? 1,
    caloriesPerServing: recipe?.caloriesPerServing ?? 0,
    proteinPerServing: recipe?.proteinPerServing ?? 0,
    carbsPerServing: recipe?.carbsPerServing ?? 0,
    fatPerServing: recipe?.fatPerServing ?? 0,
  };
}

export async function listMealPlanTemplates(coachId: string): Promise<MealPlanTemplateSummary[]> {
  const [{ data, error }, recipeMap] = await Promise.all([
    supabase
      .from('meal_plan_templates')
      .select(
        'id, name, goal_type, target_protein_percent, target_carb_percent, target_fat_percent, meal_plan_template_items (id, meal_slot, recipe_id, servings)'
      )
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false }),
    fetchRecipeSummaryMap(coachId),
  ]);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const itemRows =
      (row.meal_plan_template_items as { id: string; meal_slot: string; recipe_id: string; servings: number }[]) ?? [];
    const items = itemRows.map((item) => toTemplateItem(item, recipeMap));

    return {
      id: row.id as string,
      name: row.name as string,
      goalType: row.goal_type as GoalType,
      targetProteinPercent: row.target_protein_percent as number,
      targetCarbPercent: row.target_carb_percent as number,
      targetFatPercent: row.target_fat_percent as number,
      itemCount: items.length,
      ...computeMealPlanTotals(items),
    };
  });
}

export async function getMealPlanTemplateDetail(templateId: string): Promise<MealPlanTemplateDetail> {
  const { data: template, error: templateError } = await supabase
    .from('meal_plan_templates')
    .select('id, coach_id, name, goal_type, target_protein_percent, target_carb_percent, target_fat_percent')
    .eq('id', templateId)
    .single();

  if (templateError) throw templateError;

  const { data: itemRows, error: itemsError } = await supabase
    .from('meal_plan_template_items')
    .select('id, meal_slot, recipe_id, servings, sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  if (itemsError) throw itemsError;

  const recipeMap = await fetchRecipeSummaryMap(template.coach_id as string);
  const items = (itemRows ?? []).map((row) => toTemplateItem(row, recipeMap));

  const itemsBySlot: Record<MealSlot, MealPlanTemplateItem[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  for (const item of items) itemsBySlot[item.mealSlot].push(item);

  return {
    id: template.id as string,
    name: template.name as string,
    goalType: template.goal_type as GoalType,
    targetProteinPercent: template.target_protein_percent as number,
    targetCarbPercent: template.target_carb_percent as number,
    targetFatPercent: template.target_fat_percent as number,
    itemCount: items.length,
    itemsBySlot,
    ...computeMealPlanTotals(items),
  };
}

export async function createMealPlanTemplate(
  coachId: string,
  fields: { name: string; goalType: GoalType; targetProteinPercent: number; targetCarbPercent: number; targetFatPercent: number }
): Promise<string> {
  const { data, error } = await supabase
    .from('meal_plan_templates')
    .insert({
      coach_id: coachId,
      name: fields.name,
      goal_type: fields.goalType,
      target_protein_percent: fields.targetProteinPercent,
      target_carb_percent: fields.targetCarbPercent,
      target_fat_percent: fields.targetFatPercent,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function updateMealPlanTemplateDetails(
  templateId: string,
  fields: { name: string; goalType: GoalType; targetProteinPercent: number; targetCarbPercent: number; targetFatPercent: number }
) {
  const { error } = await supabase
    .from('meal_plan_templates')
    .update({
      name: fields.name,
      goal_type: fields.goalType,
      target_protein_percent: fields.targetProteinPercent,
      target_carb_percent: fields.targetCarbPercent,
      target_fat_percent: fields.targetFatPercent,
    })
    .eq('id', templateId);

  if (error) throw error;
}

export async function deleteMealPlanTemplate(templateId: string) {
  const { error } = await supabase.from('meal_plan_templates').delete().eq('id', templateId);
  if (error) throw error;
}

export async function addMealPlanItem(
  templateId: string,
  fields: { mealSlot: MealSlot; recipeId: string; servings: number },
  sortOrder: number
) {
  const { error } = await supabase.from('meal_plan_template_items').insert({
    template_id: templateId,
    meal_slot: fields.mealSlot,
    recipe_id: fields.recipeId,
    servings: fields.servings,
    sort_order: sortOrder,
  });

  if (error) throw error;
}

export async function removeMealPlanItem(itemId: string) {
  const { error } = await supabase.from('meal_plan_template_items').delete().eq('id', itemId);
  if (error) throw error;
}

export type MealPlanAssignmentSummary = {
  id: string;
  templateId: string;
  templateName: string;
  assignedAt: string;
};

export async function assignMealPlanToClient(templateId: string, clientId: string): Promise<string> {
  const { data, error } = await supabase
    .from('meal_plan_assignments')
    .insert({ template_id: templateId, client_id: clientId })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function listMealPlanAssignmentsForClient(clientId: string): Promise<MealPlanAssignmentSummary[]> {
  const { data, error } = await supabase
    .from('meal_plan_assignments')
    .select('id, template_id, assigned_at, meal_plan_templates (name)')
    .eq('client_id', clientId)
    .order('assigned_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    templateId: row.template_id as string,
    templateName: (row.meal_plan_templates as unknown as { name: string } | null)?.name ?? 'Unknown template',
    assignedAt: row.assigned_at as string,
  }));
}

export async function deleteMealPlanAssignment(assignmentId: string) {
  const { error } = await supabase.from('meal_plan_assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}

export type ScaledMealPlanItem = {
  itemId: string;
  mealSlot: MealSlot;
  recipeId: string;
  recipeName: string;
  baselineServings: number;
  scaledIngredients: RecipeIngredient[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type ScaledMealPlan = {
  baselineCalories: number;
  scaleFactor: number;
  clientTargetCalories: number;
  items: ScaledMealPlanItem[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
};

export type MealPlanScalingInput = {
  id: string;
  mealSlot: MealSlot;
  recipeId: string;
  recipeName: string;
  /** Baseline servings of this recipe prescribed for this slot. */
  servings: number;
  /** Total servings the recipe itself yields. */
  recipeServings: number;
  ingredients: RecipeIngredient[];
};

function scaleIngredients(ingredients: RecipeIngredient[], factor: number): RecipeIngredient[] {
  return ingredients.map((ingredient) => ({
    ...ingredient,
    quantityGrams: ingredient.quantityGrams * factor,
    calories: ingredient.calories * factor,
    protein: ingredient.protein === null ? null : ingredient.protein * factor,
    carbs: ingredient.carbs === null ? null : ingredient.carbs * factor,
    fat: ingredient.fat === null ? null : ingredient.fat * factor,
    sugars: ingredient.sugars === null ? null : ingredient.sugars * factor,
    saturatedFat: ingredient.saturatedFat === null ? null : ingredient.saturatedFat * factor,
    sodiumMg: ingredient.sodiumMg === null ? null : ingredient.sodiumMg * factor,
    fiber: ingredient.fiber === null ? null : ingredient.fiber * factor,
    // fruitVegLegumeNutPercent is deliberately NOT scaled -- it's a
    // ratio of the ingredient itself, not an absolute amount, so it
    // stays the same regardless of how much of it is used.
  }));
}

function sumIngredientMacros(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, ingredient) => ({
      calories: acc.calories + ingredient.calories,
      protein: acc.protein + (ingredient.protein ?? 0),
      carbs: acc.carbs + (ingredient.carbs ?? 0),
      fat: acc.fat + (ingredient.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/**
 * The whole portion-scaling engine, pure and independent of the
 * database -- see the README's Meal Plan Templates section for the
 * worked example this implements. Two passes over the same ingredient
 * data: the first (factor = 1 per item, i.e. exactly what's prescribed
 * at baseline) establishes the template's true baseline calorie total;
 * the second applies scaleFactor = clientTargetCalories / baseline to
 * every ingredient in every recipe, uniformly, so the scaled day's
 * total lands on the client's real target exactly -- by construction,
 * not by approximation.
 */
export function scaleMealPlan(items: MealPlanScalingInput[], clientTargetCalories: number): ScaledMealPlan {
  // "How much of this recipe's whole ingredient list one slot's
  // prescribed servings represents" -- e.g. 1 serving of a 4-serving
  // recipe is a 0.25 factor against that recipe's ingredient amounts.
  const baselineFactors = items.map((item) => item.servings / item.recipeServings);

  const baselineCalories = items.reduce((sum, item, index) => {
    const scaled = scaleIngredients(item.ingredients, baselineFactors[index]);
    return sum + sumIngredientMacros(scaled).calories;
  }, 0);

  const scaleFactor = baselineCalories > 0 ? clientTargetCalories / baselineCalories : 0;

  const scaledItems: ScaledMealPlanItem[] = items.map((item, index) => {
    const combinedFactor = baselineFactors[index] * scaleFactor;
    const scaledIngredients = scaleIngredients(item.ingredients, combinedFactor);
    const sums = sumIngredientMacros(scaledIngredients);
    return {
      itemId: item.id,
      mealSlot: item.mealSlot,
      recipeId: item.recipeId,
      recipeName: item.recipeName,
      baselineServings: item.servings,
      scaledIngredients,
      calories: sums.calories,
      protein: sums.protein,
      carbs: sums.carbs,
      fat: sums.fat,
    };
  });

  const totals = scaledItems.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return { baselineCalories, scaleFactor, clientTargetCalories, items: scaledItems, totals };
}

export type ScaledMealPlanResult =
  | { hasCalorieTarget: false; templateName: string; clientId: string }
  | { hasCalorieTarget: true; templateName: string; clientId: string; scaled: ScaledMealPlan };

/**
 * Loads an assignment and scales it live against the client's CURRENT
 * calorie target -- deliberately recalculated on every call rather than
 * read from any frozen/stored value, so it stays correct as Adaptive
 * TDEE recalculates the client's target week to week.
 */
export async function getScaledMealPlan(assignmentId: string): Promise<ScaledMealPlanResult> {
  const { data: assignment, error: assignmentError } = await supabase
    .from('meal_plan_assignments')
    .select('id, template_id, client_id')
    .eq('id', assignmentId)
    .single();

  if (assignmentError) throw assignmentError;

  const templateId = assignment.template_id as string;
  const clientId = assignment.client_id as string;

  const { data: template, error: templateError } = await supabase
    .from('meal_plan_templates')
    .select('id, name')
    .eq('id', templateId)
    .single();

  if (templateError) throw templateError;

  const templateName = template.name as string;

  const target = await getCalorieTarget(clientId);
  if (!target) {
    return { hasCalorieTarget: false, templateName, clientId };
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from('meal_plan_template_items')
    .select('id, meal_slot, recipe_id, servings')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  if (itemsError) throw itemsError;

  const uniqueRecipeIds = [...new Set((itemRows ?? []).map((row) => row.recipe_id as string))];
  const recipeDetails = await Promise.all(uniqueRecipeIds.map((id) => getRecipeDetail(id)));
  const recipeDetailMap = new Map(recipeDetails.map((recipe) => [recipe.id, recipe]));

  const scalingInputs: MealPlanScalingInput[] = (itemRows ?? []).map((row) => {
    const recipe = recipeDetailMap.get(row.recipe_id as string);
    return {
      id: row.id as string,
      mealSlot: row.meal_slot as MealSlot,
      recipeId: row.recipe_id as string,
      recipeName: recipe?.name ?? 'Unknown recipe',
      servings: row.servings as number,
      recipeServings: recipe?.servings ?? 1,
      ingredients: recipe?.ingredients ?? [],
    };
  });

  const scaled = scaleMealPlan(scalingInputs, target.targetCalories);

  return { hasCalorieTarget: true, templateName, clientId, scaled };
}
