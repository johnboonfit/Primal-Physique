import type { FoodSearchResult } from '@/lib/open-food-facts';
import { estimateFruitVegLegumeNutPercentFromCategory } from '@/lib/nutri-score';

/**
 * A thin client for USDA FoodData Central's public search API — the
 * primary source for typed food search. Open Food Facts is built for
 * barcoded, branded packaged products and is weak on generic whole
 * foods ("chicken breast," "rice," "apple"); USDA's data is the
 * opposite — government lab-analyzed reference data for exactly those
 * everyday foods. This is a live query every time, same as Open Food
 * Facts — nothing from USDA is stored ahead of time either.
 */

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Foundation and SR Legacy are lab-analyzed reference data for raw and
// common ingredients; Survey (FNDDS) covers the "as eaten" everyday
// foods people actually search for (e.g. "chicken breast, cooked,
// rotisserie"). Branded is deliberately excluded — that's commercial
// packaged products, which is exactly what Open Food Facts already
// covers, and mixing it in would bring back the noisy, incomplete
// entries this source exists to avoid.
const DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];

type UsdaNutrient = {
  nutrientName?: string;
  unitName?: string;
  value?: number;
};

function findNutrient(nutrients: UsdaNutrient[], name: string, unit?: string): number | null {
  const match = nutrients.find((nutrient) => {
    if ((nutrient.nutrientName ?? '').toLowerCase() !== name.toLowerCase()) return false;
    if (unit && (nutrient.unitName ?? '').toLowerCase() !== unit.toLowerCase()) return false;
    return true;
  });
  return typeof match?.value === 'number' ? match.value : null;
}

/** Tries each name in turn and returns the first match — USDA's data
 * types don't all name the same nutrient identically (e.g. some report
 * "Sugars, total including NLEA", older records just "Sugars, total"). */
function findNutrientAny(nutrients: UsdaNutrient[], names: string[], unit?: string): number | null {
  for (const name of names) {
    const value = findNutrient(nutrients, name, unit);
    if (value !== null) return value;
  }
  return null;
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const apiKey = process.env.EXPO_PUBLIC_USDA_FDC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing USDA FoodData Central API key. Copy .env.example to .env, fill in EXPO_PUBLIC_USDA_FDC_API_KEY (get a free one at fdc.nal.usda.gov/api-key-signup), then restart the dev server.'
    );
  }

  // USDA's docs specify POST with a JSON body as the reliable way to
  // filter by more than one dataType at once — a GET request with
  // several repeated `dataType` params isn't well-supported and was
  // producing an error response instead of results.
  const response = await fetch(`${SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: trimmed,
      dataType: DATA_TYPES,
      pageSize: 25,
    }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('USDA FoodData Central rejected the API key — double-check EXPO_PUBLIC_USDA_FDC_API_KEY in .env.');
    }
    if (response.status === 429) {
      throw new Error('USDA FoodData Central rate limit reached. Wait a bit and try again.');
    }
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `Failed to search USDA FoodData Central (status ${response.status}).${bodyText ? ` ${bodyText.slice(0, 200)}` : ' Check your connection and try again.'}`
    );
  }

  const data = (await response.json()) as { foods?: Record<string, unknown>[] };

  return (data.foods ?? [])
    .map((food) => {
      const nutrients = (food.foodNutrients as UsdaNutrient[] | undefined) ?? [];
      return {
        id: String(food.fdcId ?? ''),
        name: (food.description as string | undefined)?.trim() ?? '',
        brand: (food.brandOwner as string | undefined) || (food.brandName as string | undefined) || null,
        // All per-100g — USDA's foodNutrients values are standardized
        // per 100g for every dataType this search uses, matching the
        // same "per 100g" convention Open Food Facts results use.
        caloriesPer100g: findNutrient(nutrients, 'Energy', 'kcal'),
        proteinPer100g: findNutrient(nutrients, 'Protein'),
        carbsPer100g: findNutrient(nutrients, 'Carbohydrate, by difference'),
        fatPer100g: findNutrient(nutrients, 'Total lipid (fat)'),
        sugarsPer100g: findNutrientAny(nutrients, ['Sugars, total including NLEA', 'Sugars, total']),
        saturatedFatPer100g: findNutrient(nutrients, 'Fatty acids, total saturated'),
        sodiumMgPer100g: findNutrient(nutrients, 'Sodium, Na', 'mg'),
        fiberPer100g: findNutrientAny(nutrients, ['Fiber, total dietary', 'Fiber, total dietary (AOAC 2011.25)']),
        // USDA has no ready percentage either — same foodCategory-based
        // estimate as Open Food Facts' category-tag fallback, see
        // nutri-score.ts.
        fruitVegLegumeNutPercent: estimateFruitVegLegumeNutPercentFromCategory(
          (food.foodCategory as string | undefined) ?? null
        ),
      };
    })
    .filter((result): result is FoodSearchResult => result.name.length > 0 && result.caloriesPer100g !== null);
}
