import type { FoodSource } from '@/lib/food-logs';
import { searchUKFoods, type FoodSearchResult } from '@/lib/open-food-facts';
import { searchFoods as searchUsdaFoods } from '@/lib/usda-fooddata';

/** A search result tagged with which source it actually came from, so
 * the caller knows what to record on the food_logs row once one of
 * these gets logged — the two source APIs are blended into a single
 * list, but food-logs.ts still needs to know which one each entry is. */
export type BlendedFoodResult = FoodSearchResult & { source: FoodSource };

export type BlendedSearchResult = {
  results: BlendedFoodResult[];
  /** Set only when USDA — the primary, generic-food source — failed
   * (most commonly a missing/invalid API key). A failure in the
   * supplementary UK pass never sets this; that pass degrades silently
   * to "no UK results this search" instead. */
  error: string | null;
};

function normalizeTokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** A UK result only counts as a genuinely good match for what was
 * typed if every word the person searched shows up somewhere in its
 * name or brand — stops a strong UK-brand match on an unrelated
 * product (e.g. a Tesco ready meal that merely lists "chicken" as an
 * ingredient) from crowding out a plain search like "chicken breast." */
function isGoodMatch(query: string, result: FoodSearchResult): boolean {
  const queryTokens = normalizeTokens(query);
  if (queryTokens.length === 0) return false;
  const haystack = normalizeTokens(`${result.name} ${result.brand ?? ''}`);
  return queryTokens.every((token) => haystack.some((word) => word.includes(token)));
}

// Caps how many UK-branded results can sit ahead of USDA's generic
// results — keeps a search from being dominated by branded entries even
// when a lot of them technically pass the match gate above.
const MAX_UK_RESULTS = 8;

/**
 * The one function the food-add UI actually calls. Runs USDA's generic-
 * food search and Open Food Facts' UK-specific pass in parallel, filters
 * the UK pass down to genuinely well-matched results (see isGoodMatch),
 * and puts those ahead of USDA's results — so a UK supermarket product
 * that's a real match for the search surfaces prominently instead of
 * being buried under (or entirely absent from) generic USDA entries.
 */
export async function searchAllFoods(query: string): Promise<BlendedSearchResult> {
  const [usdaOutcome, ukOutcome] = await Promise.allSettled([searchUsdaFoods(query), searchUKFoods(query)]);

  const usda: BlendedFoodResult[] =
    usdaOutcome.status === 'fulfilled' ? usdaOutcome.value.map((result) => ({ ...result, source: 'usda_fdc' as const })) : [];

  let uk: BlendedFoodResult[] = [];
  if (ukOutcome.status === 'fulfilled') {
    uk = ukOutcome.value
      .filter((result) => isGoodMatch(query, result))
      .map((result) => ({ ...result, source: 'open_food_facts' as const }))
      .slice(0, MAX_UK_RESULTS);
  } else {
    // searchUKFoods() itself catches its own fetch/HTTP errors and always
    // resolves — this branch firing at all means something unexpected
    // threw. console.log, not console.error/warn: this is a background,
    // supplementary search pass (see searchUKFoods for why), and React
    // Native's on-device LogBox turns console.error/warn into an
    // on-screen banner a real coach/client would see, not just a
    // developer's console — the USDA side of this search still works
    // fine regardless.
    console.log('[searchAllFoods] UK search rejected unexpectedly:', ukOutcome.reason);
  }

  const error =
    usdaOutcome.status === 'rejected'
      ? usdaOutcome.reason instanceof Error
        ? usdaOutcome.reason.message
        : 'USDA FoodData Central search failed.'
      : null;

  return { results: [...uk, ...usda], error };
}
