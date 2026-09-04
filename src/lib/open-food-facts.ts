/**
 * A thin client for Open Food Facts' public search API — a live query
 * every time, never stored locally. No API key is needed for basic
 * search. This file only ever reads from Open Food Facts; nothing in
 * this app writes back to it.
 */

import { estimateFruitVegLegumeNutPercentFromCategory } from '@/lib/nutri-score';

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const SEARCH_V2_URL = 'https://world.openfoodfacts.org/api/v2/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

const PRODUCT_FIELDS = 'code,product_name,brands,nutriments,categories_tags,serving_size,serving_quantity';

/** A real, structured "1 x = Yg" option — e.g. "2 biscuits (25g)" or "1
 * cup, sliced" — never a guess. Only ever populated from a field the
 * source data actually provided (Open Food Facts' serving_quantity, or
 * USDA's foodMeasures — see usda-fooddata.ts); an empty array means the
 * source simply has no real portion data for this food, not that one
 * was omitted. */
export type FoodPortion = { label: string; grams: number };

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
  /** The remaining inputs the Nutri-Score formula needs beyond the four
   * basic macros above — see nutri-score.ts for how they're combined. */
  sugarsPer100g: number | null;
  saturatedFatPer100g: number | null;
  sodiumMgPer100g: number | null;
  fiberPer100g: number | null;
  /** Always a number (0 or 100 from the category-based estimate, or
   * whatever Open Food Facts itself computed) -- never null, unlike the
   * other Nutri-Score inputs above, since both search sources always
   * fall back to a category guess rather than leaving this unset. */
  fruitVegLegumeNutPercent: number;
  portions: FoodPortion[];
};

function toNumberOrNull(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Open Food Facts sometimes only has salt (g), not sodium — salt is
 * 2.5x sodium by mass (table salt is sodium chloride; the conversion
 * factor comes from the atomic weight ratio), so sodium(mg) =
 * salt(g) * 1000 / 2.5 = salt(g) * 400.
 */
function sodiumMgFromNutriments(nutriments: Record<string, unknown>): number | null {
  const sodium = toNumberOrNull(nutriments['sodium_100g']);
  if (sodium !== null) return sodium * 1000; // OFF reports sodium_100g in grams

  const salt = toNumberOrNull(nutriments['salt_100g']);
  if (salt === null) return null;
  return salt * 400;
}

/**
 * Open Food Facts occasionally has this exact estimate pre-computed from
 * a product's ingredient list — when it's there, it's a better number
 * than our own category-based guess, so it's used first.
 */
function fruitVegLegumeNutPercent(nutriments: Record<string, unknown>, categoriesTags: string[]): number {
  const estimate = toNumberOrNull(nutriments['fruits-vegetables-nuts-estimate-from-ingredients_100g']);
  if (estimate !== null) return estimate;

  const categoryText = categoriesTags.join(' ');
  return estimateFruitVegLegumeNutPercentFromCategory(categoryText || null);
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

/** `serving_quantity` is a clean numeric gram figure Open Food Facts
 * exposes alongside the free-text `serving_size` label — far more
 * reliable than trying to parse a number out of that label ourselves,
 * since its format varies wildly product to product. */
function servingPortion(product: Record<string, unknown>): FoodPortion[] {
  const grams = toNumberOrNull(product['serving_quantity']);
  if (grams === null || grams <= 0) return [];

  const label = (product['serving_size'] as string | undefined)?.trim() || `1 serving (${Math.round(grams)}g)`;
  return [{ label, grams }];
}

function mapProduct(product: Record<string, unknown>): FoodSearchResult | null {
  const nutriments = (product.nutriments as Record<string, unknown> | undefined) ?? {};
  const categoriesTags = (product.categories_tags as string[] | undefined) ?? [];
  const name = (product.product_name as string | undefined)?.trim() ?? '';
  const caloriesPer100g = caloriesFromNutriments(nutriments);

  if (!name || caloriesPer100g === null) return null;

  return {
    id: (product.code as string | undefined) || name,
    name,
    brand: (product.brands as string | undefined)?.split(',')[0]?.trim() || null,
    caloriesPer100g,
    proteinPer100g: toNumberOrNull(nutriments['proteins_100g']),
    carbsPer100g: toNumberOrNull(nutriments['carbohydrates_100g']),
    fatPer100g: toNumberOrNull(nutriments['fat_100g']),
    sugarsPer100g: toNumberOrNull(nutriments['sugars_100g']),
    saturatedFatPer100g: toNumberOrNull(nutriments['saturated-fat_100g']),
    sodiumMgPer100g: sodiumMgFromNutriments(nutriments),
    fiberPer100g: toNumberOrNull(nutriments['fiber_100g']),
    fruitVegLegumeNutPercent: fruitVegLegumeNutPercent(nutriments, categoriesTags),
    portions: servingPortion(product),
  };
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
    fields: PRODUCT_FIELDS,
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
    .map(mapProduct)
    // A result with no name or no calorie figure isn't useful to log
    // against — Open Food Facts has plenty of incomplete entries. This
    // runs against the larger 50-item pool fetched above, then trims
    // back down to a sane number to actually show.
    .filter((result): result is FoodSearchResult => result !== null)
    .slice(0, 20);
}

// Canonical Open Food Facts brand tags for the major UK supermarkets'
// own-brand ranges. Tag ids are the lowercased, hyphenated form OFF
// normalizes brand names to (apostrophes become hyphens), which is why
// Sainsbury's is "sainsbury-s" here, not "sainsburys".
const UK_SUPERMARKET_BRAND_TAGS = ['tesco', 'asda', 'aldi', 'sainsbury-s', 'morrisons', 'lidl'];

async function fetchV2Products(params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${SEARCH_V2_URL}?${new URLSearchParams(params).toString()}`, {
    headers: { 'User-Agent': 'PrimalPhysique-App - Fitness Coaching App' },
  });
  // Best-effort — this is a supplementary pass on top of the primary
  // USDA search (see food-search.ts), so a failure here should never
  // block a search from returning USDA's results.
  if (!response.ok) return [];
  const data = (await response.json()) as { products?: Record<string, unknown>[] };
  return data.products ?? [];
}

/**
 * A second, UK-specific pass over Open Food Facts, run alongside the
 * primary USDA search (see food-search.ts, which is what actually calls
 * this) — USDA has essentially zero UK branded/packaged products, so
 * typed search would otherwise never surface things like "Tesco Basmati
 * Rice" or "Warburtons Thins."
 *
 * Two parallel v2 API queries, since a single request can't OR an origin
 * filter together with a brand filter: one filtered to products actually
 * sold in the UK (`countries_tags`), one filtered to the major UK
 * supermarkets' own brand tags (`brands_tags`, comma-separated for an OR
 * match) — merged and de-duplicated by barcode below. This only fetches
 * candidates; deciding which of them are a genuinely good match for the
 * typed query (and therefore worth ranking above USDA) happens in
 * food-search.ts, not here.
 */
export async function searchUKFoods(query: string): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const baseParams = {
    search_terms: trimmed,
    sort_by: 'unique_scans_n',
    page_size: '25',
    fields: PRODUCT_FIELDS,
  };

  const [byCountry, byBrand] = await Promise.all([
    fetchV2Products({ ...baseParams, countries_tags: 'en:united-kingdom' }),
    fetchV2Products({ ...baseParams, brands_tags: UK_SUPERMARKET_BRAND_TAGS.join(',') }),
  ]);

  const seen = new Set<string>();
  const merged: FoodSearchResult[] = [];
  for (const product of [...byCountry, ...byBrand]) {
    const mapped = mapProduct(product);
    if (!mapped) continue;
    if (seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    merged.push(mapped);
  }
  return merged;
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

  const params = new URLSearchParams({ fields: PRODUCT_FIELDS });

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

  const mapped = mapProduct(data.product);
  // mapProduct falls back to the product's name for `id` when no barcode
  // field came back, which barcode lookup should never do — the scanned
  // barcode itself is the more correct fallback here.
  return mapped ? { ...mapped, id: (data.product.code as string | undefined) || trimmed } : null;
}
