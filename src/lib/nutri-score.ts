/**
 * The public Nutri-Score formula (Santé publique France's 2017 "general
 * foods" algorithm), computed from scratch against our own nutrient
 * data -- deliberately not read off any source's pre-existing badge,
 * since USDA FoodData Central (our primary generic-food source) doesn't
 * carry a Nutri-Score at all, and even Open Food Facts' own badge isn't
 * something every product has filled in correctly.
 *
 * Negative points (0-10 each, from energy/sugars/saturated fat/sodium)
 * minus positive points (0-5 each, from fruit-veg-legume-nut %/fibre/
 * protein) nets to a score; the score maps to an A-E grade. Everything
 * here is defined per 100g of the food -- that's a hard requirement of
 * the formula itself, not a stylistic choice, since every real-world
 * Nutri-Score badge is computed and displayed on that same per-100g
 * basis. Beverages and a handful of other special categories (cheese,
 * added fats) use different point tables in the official algorithm;
 * this app only ever scores solid/generic foods and recipes, so only
 * the general-food table is implemented.
 */

export type NutriScoreGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export type NutriScoreInput = {
  /** Per 100g. */
  caloriesPer100g: number;
  sugarsPer100g: number | null;
  saturatedFatPer100g: number | null;
  sodiumMgPer100g: number | null;
  fiberPer100g: number | null;
  proteinPer100g: number | null;
  /** 0-100 estimate of what fraction of the food, by weight, is fruit,
   * vegetables, legumes, or nuts -- see estimateFruitVegLegumeNutPercent(). */
  fruitVegLegumeNutPercent: number | null;
};

export type NutriScoreBreakdown = {
  energyPoints: number;
  sugarsPoints: number;
  saturatedFatPoints: number;
  sodiumPoints: number;
  fruitVegLegumeNutPoints: number;
  fiberPoints: number;
  proteinPoints: number;
  /** False when the "≥11 negative points and not maxed-out fruit/veg"
   * rule zeroed protein out of the positive total -- see computeNutriScore. */
  proteinCounted: boolean;
};

export type NutriScoreResult = {
  grade: NutriScoreGrade;
  score: number;
  negativePoints: number;
  positivePoints: number;
  breakdown: NutriScoreBreakdown;
};

// Each array holds the 10 ascending upper bounds for points 0 through 9;
// a value above the last bound scores the full 10 points.
const ENERGY_KJ_THRESHOLDS = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const SUGARS_G_THRESHOLDS = [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45];
const SATURATED_FAT_G_THRESHOLDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SODIUM_MG_THRESHOLDS = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900];

// Fibre and protein only go up to 5 points, over 5 ascending bounds.
const FIBER_G_THRESHOLDS = [0.9, 1.9, 2.8, 3.7, 4.7];
const PROTEIN_G_THRESHOLDS = [1.6, 3.2, 4.8, 6.4, 8.0];

function pointsFromThresholds(value: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return i;
  }
  return thresholds.length;
}

/**
 * The fruit/veg/legume/nut point table deliberately isn't a smooth
 * staircase -- it jumps from 2 points straight to 5 above 80%, skipping
 * 3 and 4 entirely. That's the official table, not a simplification:
 * it's designed to reward genuinely plant-dominant foods hard rather
 * than gradually.
 */
function fruitVegLegumeNutPoints(percent: number): number {
  if (percent > 80) return 5;
  if (percent > 60) return 2;
  if (percent > 40) return 1;
  return 0;
}

function gradeFromScore(score: number): NutriScoreGrade {
  if (score <= -1) return 'A';
  if (score <= 2) return 'B';
  if (score <= 10) return 'C';
  if (score <= 18) return 'D';
  return 'E';
}

/**
 * The one place the actual point math happens. A missing input (null)
 * is treated as 0 for that nutrient -- the same "unknown counts as
 * none" rule this app already uses for macros it can't find (see
 * computeMacroTotals) -- since there's no principled better guess for a
 * gap in real nutrient data, and treating missing as 0 never gives a
 * food credit it hasn't earned.
 */
export function computeNutriScore(input: NutriScoreInput): NutriScoreResult {
  const energyKj = input.caloriesPer100g * 4.184;

  const energyPoints = pointsFromThresholds(energyKj, ENERGY_KJ_THRESHOLDS);
  const sugarsPoints = pointsFromThresholds(input.sugarsPer100g ?? 0, SUGARS_G_THRESHOLDS);
  const saturatedFatPoints = pointsFromThresholds(input.saturatedFatPer100g ?? 0, SATURATED_FAT_G_THRESHOLDS);
  const sodiumPoints = pointsFromThresholds(input.sodiumMgPer100g ?? 0, SODIUM_MG_THRESHOLDS);
  const negativePoints = energyPoints + sugarsPoints + saturatedFatPoints + sodiumPoints;

  const fruitVegPoints = fruitVegLegumeNutPoints(input.fruitVegLegumeNutPercent ?? 0);
  const fiberPoints = pointsFromThresholds(input.fiberPer100g ?? 0, FIBER_G_THRESHOLDS);
  const proteinPointsRaw = pointsFromThresholds(input.proteinPer100g ?? 0, PROTEIN_G_THRESHOLDS);

  // The one non-additive rule in the whole formula: a food that's bad
  // enough on energy/sugar/fat/sodium (>=11 negative points) can't use
  // protein to buy its way to a better grade unless it's also
  // essentially all fruit/veg/legume/nut (max fruit-veg points).
  const proteinCounted = negativePoints < 11 || fruitVegPoints >= 5;
  const proteinPoints = proteinCounted ? proteinPointsRaw : 0;
  const positivePoints = fruitVegPoints + fiberPoints + proteinPoints;

  const score = negativePoints - positivePoints;

  return {
    grade: gradeFromScore(score),
    score,
    negativePoints,
    positivePoints,
    breakdown: {
      energyPoints,
      sugarsPoints,
      saturatedFatPoints,
      sodiumPoints,
      fruitVegLegumeNutPoints: fruitVegPoints,
      fiberPoints,
      proteinPoints,
      proteinCounted,
    },
  };
}

// Neither USDA nor Open Food Facts expose a ready-to-use "% fruit,
// vegetable, legume, or nut by weight" figure for arbitrary foods --
// getting the true figure requires parsing a product's ingredient list
// and estimating each ingredient's share, which neither source does for
// us. This is the standard practical stand-in: a food whose own
// category IS fruit/vegetable/legume/nuts is treated as 100% one (a raw
// apple or a can of chickpeas really is that), and anything else is
// treated as 0% -- an approximation, not a precise ingredient-weight
// calculation, but the same one most Nutri-Score implementations outside
// the official EU/OFF tooling fall back on.
const FRUIT_VEG_LEGUME_NUT_KEYWORDS = ['fruit', 'vegetable', 'legume', 'bean', 'pea', 'lentil', 'nut', 'seed'];

// Whole-word matching, not a plain substring check -- "nut" as a plain
// substring would wrongly flag "hazelnut" (Nutella), "peanut", and
// "coconut" as 100% nuts, and "pea" would do the same to "peanut". \b is
// a transition between a word character and a non-word character, so it
// correctly rejects "nut" inside "hazelnut" (no boundary between "l" and
// "n") while still matching a category tag that's just "nuts" on its own.
const FRUIT_VEG_LEGUME_NUT_PATTERN = new RegExp(`\\b(${FRUIT_VEG_LEGUME_NUT_KEYWORDS.join('|')})s?\\b`, 'i');

export function isFruitVegLegumeNutCategoryText(categoryText: string): boolean {
  return FRUIT_VEG_LEGUME_NUT_PATTERN.test(categoryText);
}

export function estimateFruitVegLegumeNutPercentFromCategory(categoryText: string | null): number {
  if (!categoryText) return 0;
  return isFruitVegLegumeNutCategoryText(categoryText) ? 100 : 0;
}

export type RecipeNutriScoreIngredient = {
  quantityGrams: number;
  calories: number;
  sugars: number | null;
  saturatedFat: number | null;
  sodiumMg: number | null;
  fiber: number | null;
  protein: number | null;
  fruitVegLegumeNutPercent: number | null;
};

export type RecipeNutriScoreResult = {
  result: NutriScoreResult;
  /** Grams per serving the score was normalized against -- shown
   * alongside the badge so it's clear what "per 100g" means for this
   * specific recipe. */
  gramsPerServing: number;
};

/**
 * Scores a whole recipe: sum every ingredient's already-scaled amounts
 * (the same cached snapshot recipe_ingredients stores for macros),
 * divide by servings to get per-serving totals, then re-normalize those
 * per-serving totals to a per-100g-of-recipe basis before running the
 * exact same computeNutriScore() used for a single ingredient. That
 * last step matters: Nutri-Score is only ever meaningful per 100g, so
 * scoring raw per-serving totals directly would grade a 600g serving
 * and a 150g serving on incomparable scales, and wouldn't match how any
 * real product's badge is actually computed.
 */
export function computeRecipeNutriScore(
  ingredients: RecipeNutriScoreIngredient[],
  servings: number
): RecipeNutriScoreResult {
  const totalGrams = ingredients.reduce((sum, i) => sum + i.quantityGrams, 0);

  const totals = ingredients.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      sugars: acc.sugars + (i.sugars ?? 0),
      saturatedFat: acc.saturatedFat + (i.saturatedFat ?? 0),
      sodiumMg: acc.sodiumMg + (i.sodiumMg ?? 0),
      fiber: acc.fiber + (i.fiber ?? 0),
      protein: acc.protein + (i.protein ?? 0),
      // Weighted by mass, not a plain average across ingredients -- 200g
      // of chicken and 10g of parsley shouldn't count equally toward the
      // recipe's fruit/veg/legume/nut share.
      fruitVegWeighted: acc.fruitVegWeighted + (i.fruitVegLegumeNutPercent ?? 0) * i.quantityGrams,
    }),
    { calories: 0, sugars: 0, saturatedFat: 0, sodiumMg: 0, fiber: 0, protein: 0, fruitVegWeighted: 0 }
  );

  const gramsPerServing = servings > 0 ? totalGrams / servings : 0;
  // Guards against a recipe with no ingredients yet (0g) dividing by
  // zero -- there's nothing meaningful to score in that case anyway.
  const scaleTo100g = gramsPerServing > 0 ? 100 / gramsPerServing : 0;
  const perServingDivisor = servings > 0 ? servings : 1;

  const result = computeNutriScore({
    caloriesPer100g: (totals.calories / perServingDivisor) * scaleTo100g,
    sugarsPer100g: (totals.sugars / perServingDivisor) * scaleTo100g,
    saturatedFatPer100g: (totals.saturatedFat / perServingDivisor) * scaleTo100g,
    sodiumMgPer100g: (totals.sodiumMg / perServingDivisor) * scaleTo100g,
    fiberPer100g: (totals.fiber / perServingDivisor) * scaleTo100g,
    proteinPer100g: (totals.protein / perServingDivisor) * scaleTo100g,
    fruitVegLegumeNutPercent: totalGrams > 0 ? totals.fruitVegWeighted / totalGrams : 0,
  });

  return { result, gramsPerServing };
}
