/**
 * A thin client for Open Food Facts' public search API — a live query
 * every time, never stored locally. No API key is needed for basic
 * search. This file only ever reads from Open Food Facts; nothing in
 * this app writes back to it.
 */

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

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

/**
 * Open Food Facts doesn't always populate its normalized
 * `energy-kcal_100g` field — some entries only carry the raw `energy_100g`
 * figure plus an `energy_unit` saying whether that's already kcal or is
 * kJ (the more common case, since kJ is the field's default unit).
 * Falling back to that conversion rescues otherwise-usable entries that
 * would silently disappear if only the normalized field were checked.
 */
function caloriesFromNutriments(nutriments: Record<string, unknown>): number | null {
  const kcal = toNumberOrNull(nutriments['energy-kcal_100g']);
  if (kcal !== null) return kcal;

  const raw = toNumberOrNull(nutriments['energy_100g']);
  if (raw === null) return null;

  const unit = String(nutriments['energy_unit'] ?? 'kj').toLowerCase();
  return unit === 'kcal' ? raw : raw / 4.184;
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    search_terms: trimmed,
    search_simple: '1',
    action: 'process',
    json: '1',
    // Open Food Facts' default ordering for search.pl isn't relevance-
    // sorted, and a lot of its entries (especially generic, unbranded
    // ones) are missing complete nutrition data. Sorting by scan
    // popularity surfaces well-known, well-filled-out products first,
    // and fetching a larger pool gives the completeness filter below
    // enough candidates to actually find real matches in — a plain
    // page_size of 20 with no sort was leaving common searches like
    // "chicken" with nothing usable in the top results.
    sort_by: 'unique_scans_n',
    page_size: '50',
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
        caloriesPer100g: caloriesFromNutriments(nutriments),
        proteinPer100g: toNumberOrNull(nutriments['proteins_100g']),
        carbsPer100g: toNumberOrNull(nutriments['carbohydrates_100g']),
        fatPer100g: toNumberOrNull(nutriments['fat_100g']),
      };
    })
    // A result with no name or no calorie figure isn't useful to log
    // against — Open Food Facts has plenty of incomplete entries. This
    // runs against the larger 50-item pool fetched above, then trims
    // back down to a sane number to actually show.
    .filter((result): result is FoodSearchResult => result.name.length > 0 && result.caloriesPer100g !== null)
    .slice(0, 20);
}

/**
 * Looks up one exact product by its scanned barcode — Open Food Facts'
 * actual strength, since every product there is keyed by barcode. This
 * is the only place this app calls Open Food Facts now that typed
 * search goes through USDA FoodData Central instead; barcode lookup
 * was never the weak part.
 *
 * Returns null (not an error) for "no such barcode" or "found, but
 * missing the data needed to log it" — both are ordinary, expected
 * outcomes the scanner screen turns into a plain "not found" message,
 * not a failure.
 */
export async function getProductByBarcode(barcode: string): Promise<FoodSearchResult | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({ fields: 'code,product_name,brands,nutriments' });

  const response = await fetch(`${PRODUCT_URL}/${encodeURIComponent(trimmed)}.json?${params.toString()}`, {
    headers: {
      'User-Agent': 'PrimalPhysique-App - Fitness Coaching App',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to look up that barcode. Check your connection and try again.');
  }

  const data = (await response.json()) as { status?: number; product?: Record<string, unknown> };

  if (data.status !== 1 || !data.product) return null;

  const nutriments = (data.product.nutriments as Record<string, unknown> | undefined) ?? {};
  const name = (data.product.product_name as string | undefined)?.trim() ?? '';
  const caloriesPer100g = caloriesFromNutriments(nutriments);

  if (!name || caloriesPer100g === null) return null;

  return {
    id: (data.product.code as string | undefined) || trimmed,
    name,
    brand: (data.product.brands as string | undefined)?.split(',')[0]?.trim() || null,
    caloriesPer100g,
    proteinPer100g: toNumberOrNull(nutriments['proteins_100g']),
    carbsPer100g: toNumberOrNull(nutriments['carbohydrates_100g']),
    fatPer100g: toNumberOrNull(nutriments['fat_100g']),
  };
}
