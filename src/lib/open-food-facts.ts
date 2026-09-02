/**
 * A thin client for Open Food Facts' public search API — a live query
 * every time, never stored locally. No API key is needed for basic
 * search. This file only ever reads from Open Food Facts; nothing in
 * this app writes back to it.
 */

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

export type FoodSearchResult = {
  /** Open Food Facts' barcode, when the product has one — used as a
   * stable key for the results list, and stored (never re-fetched) as
   * provenance on the food_logs row a client saves. */
  id: string;
  name: string;
  brand: string | null;
  /** All per-100g, since Open Food Facts records nutrition per 100g
   * for virtually every product and per-serving data is inconsistent
   * across brands — kept simple rather than trying to parse arbitrary
   * serving-size strings like "30g (1 slice)". */
  caloriesPer100g: number;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
};

function toNumberOrNull(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    search_terms: trimmed,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '20',
    fields: 'code,product_name,brands,nutriments',
  });

  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: {
      // Open Food Facts asks API consumers to identify their app. Web
      // browsers block scripts from setting this header at all, so on
      // web this is silently dropped by the platform — harmless, just
      // means the request looks anonymous there instead of named.
      'User-Agent': 'PrimalPhysique-App - Fitness Coaching App',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to search Open Food Facts. Check your connection and try again.');
  }

  const data = (await response.json()) as { products?: Record<string, unknown>[] };

  return (data.products ?? [])
    .map((product) => {
      const nutriments = (product.nutriments as Record<string, unknown> | undefined) ?? {};
      return {
        id: (product.code as string | undefined) || (product.product_name as string | undefined) || '',
        name: (product.product_name as string | undefined)?.trim() ?? '',
        brand: (product.brands as string | undefined)?.split(',')[0]?.trim() || null,
        caloriesPer100g: toNumberOrNull(nutriments['energy-kcal_100g']),
        proteinPer100g: toNumberOrNull(nutriments['proteins_100g']),
        carbsPer100g: toNumberOrNull(nutriments['carbohydrates_100g']),
        fatPer100g: toNumberOrNull(nutriments['fat_100g']),
      };
    })
    // A result with no name or no calorie figure isn't useful to log
    // against — Open Food Facts has plenty of incomplete entries.
    .filter(
      (result): result is FoodSearchResult => result.name.length > 0 && result.caloriesPer100g !== null
    );
}
