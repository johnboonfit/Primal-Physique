import type { CalorieTarget } from '@/lib/tdee';
import { supabase } from '@/lib/supabase';

export type MacroTargets = {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

// Grams of protein per kg of (smoothed) bodyweight. Evidence-based
// ranges for someone training for hypertrophy sit at roughly 1.6-2.2
// g/kg (Helms et al.) -- higher end while cutting, since protein is what
// protects lean mass in a deficit; lower end while bulking, since a
// surplus already does most of that work. Recomp/strength/no active
// phase default to the same middle-of-range number a maintenance client
// would use.
const PROTEIN_G_PER_KG: Record<CalorieTarget['goalType'] & string, number> = {
  cutting: 2.2,
  bulking: 1.8,
  recomp: 2.0,
  strength: 2.0,
};
const DEFAULT_PROTEIN_G_PER_KG = 2.0;

// Fat's share of total target calories -- 25% is a common baseline
// floor for hormonal health, with carbs (not fat) absorbing whatever
// the calorie target moves by day to day.
const FAT_SHARE_OF_CALORIES = 0.25;

/**
 * Real protein/carb/fat gram targets, built from the client's own
 * logged bodyweight and their existing calorie target -- not a fixed
 * guess. Returns null if there's no weight logged yet at all (the same
 * "not enough data yet" honesty getCalorieTarget already applies, since
 * a client with a calorie target almost always has a recent weigh-in
 * too, but this doesn't assume it).
 */
export async function getMacroTargets(clientId: string, calorieTarget: CalorieTarget): Promise<MacroTargets | null> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('weight_trend')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const bodyweightKg = data.weight_trend as number;
  const proteinPerKg = calorieTarget.goalType ? PROTEIN_G_PER_KG[calorieTarget.goalType] : DEFAULT_PROTEIN_G_PER_KG;

  const proteinGrams = bodyweightKg * proteinPerKg;
  const fatGrams = (calorieTarget.targetCalories * FAT_SHARE_OF_CALORIES) / 9;
  const remainingCalories = calorieTarget.targetCalories - proteinGrams * 4 - fatGrams * 9;
  const carbsGrams = Math.max(0, remainingCalories) / 4;

  return {
    proteinGrams: Math.round(proteinGrams),
    carbsGrams: Math.round(carbsGrams),
    fatGrams: Math.round(fatGrams),
  };
}
