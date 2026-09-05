import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalorieRing } from '@/components/calorie-ring';
import { MacroBar } from '@/components/macro-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  addFoodLog,
  deleteFoodLog,
  listFoodLogsForDate,
  updateFoodLogQuantity,
  type FoodLogEntry,
  type FoodSource,
  type Meal,
} from '@/lib/food-logs';
import { searchAllFoods, type BlendedFoodResult } from '@/lib/food-search';
import { getMacroTargets, type MacroTargets } from '@/lib/macros';
import { getProductByBarcode, type FoodSearchResult } from '@/lib/open-food-facts';
import { GOAL_TYPES } from '@/lib/programmes';
import { listSavedMeals, logSavedMeal, saveMealFromEntries, type SavedMeal } from '@/lib/saved-meals';
import { addDays } from '@/lib/time-ranges';
import { getCalorieTarget, type CalorieTarget } from '@/lib/tdee';
import { awardMealXp } from '@/lib/xp';

// EAN-13/EAN-8 and UPC-A/UPC-E cover essentially every retail packaged
// food barcode worldwide — no need to scan for QR codes or other
// symbologies here.
const FOOD_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

const SEARCH_DEBOUNCE_MS = 400;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/** `timeZone: 'UTC'` matches how the calendar formats its own ISO dates
 * (see session-calendar.tsx) — logDate is always a UTC calendar date, so
 * formatting it in the device's local zone could shift it a day either
 * way right around midnight. */
function formatDisplayDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

/** Which meal the header's quick-add (search) button logs into — just a
 * sensible time-of-day guess, the same idea client/index.tsx's own
 * greeting already uses, not tied to what's actually been logged yet. */
function currentMealByTime(): Meal {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 20) return 'dinner';
  return 'snacks';
}

function goalLabel(goalType: CalorieTarget['goalType']) {
  if (!goalType) return 'Maintenance';
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

/** Scales a per-100g figure to a given quantity in grams — e.g. 165
 * cal/100g at 150g is 165 * (150 / 100) = 247.5. Returns null through
 * untouched, since "unknown" scaled by anything is still unknown. */
function scaleMacro(per100g: number | null, grams: number): number | null {
  if (per100g === null) return null;
  return per100g * (grams / 100);
}

function macroSummary(entry: {
  quantityGrams: number;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}) {
  const parts = [`${round(entry.quantityGrams)}g`, `${Math.round(entry.calories)} cal`];
  if (entry.protein !== null) parts.push(`${round(entry.protein)}g protein`);
  if (entry.carbs !== null) parts.push(`${round(entry.carbs)}g carbs`);
  if (entry.fat !== null) parts.push(`${round(entry.fat)}g fat`);
  return parts.join(' · ');
}

export default function NutritionScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [logDate, setLogDate] = useState(todayISODate());
  const isToday = logDate === todayISODate();

  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<CalorieTarget | null>(null);
  const [macroTargets, setMacroTargets] = useState<MacroTargets | null>(null);

  const [activeMeal, setActiveMeal] = useState<Meal | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<BlendedFoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [selectedSource, setSelectedSource] = useState<FoodSource | null>(null);

  // Quantity is entered one of three ways depending on what the food's
  // source data actually offers — see food-search.ts/usda-fooddata.ts for
  // where `portions` real (never guessed) per-item weights come from.
  const [unitMode, setUnitMode] = useState<'grams' | 'portion' | 'custom'>('grams');
  const [portionIndex, setPortionIndex] = useState(0);
  const [countInput, setCountInput] = useState('1');
  const [customGramsInput, setCustomGramsInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('100');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingEntry, setEditingEntry] = useState<FoodLogEntry | null>(null);
  const [editQuantityInput, setEditQuantityInput] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const hasScannedRef = useRef(false);

  const searchRequestId = useRef(0);

  // Saved Meals -- fetched once alongside the rest of this screen's
  // data, reused by both the add-food modal's "Use a saved meal" list
  // and the "Save as meal" prompt (which just needs the list to refresh
  // after adding a new one, not to build one).
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [showingSavedMeals, setShowingSavedMeals] = useState(false);
  const [loggingSavedMealId, setLoggingSavedMealId] = useState<string | null>(null);
  const [savedMealError, setSavedMealError] = useState<string | null>(null);

  const [savingMealFrom, setSavingMealFrom] = useState<Meal | null>(null);
  const [saveMealName, setSaveMealName] = useState('');
  const [savingMeal, setSavingMeal] = useState(false);
  const [saveMealError, setSaveMealError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listFoodLogsForDate(session.user.id, logDate)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load today's food log."))
      .finally(() => setLoading(false));

    getCalorieTarget(session.user.id)
      .then((calorieTarget) => {
        setTarget(calorieTarget);
        if (!calorieTarget) {
          setMacroTargets(null);
          return;
        }
        return getMacroTargets(session.user.id, calorieTarget).then(setMacroTargets);
      })
      .catch((err) => console.error('Failed to load calorie/macro targets:', err));

    listSavedMeals(session.user.id)
      .then(setSavedMeals)
      .catch((err) => console.error('Failed to load saved meals:', err));
  }, [session, logDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live blended search — USDA's generic foods plus a UK-supermarket-
  // targeted pass over Open Food Facts (see food-search.ts) — debounced
  // so it doesn't fire on every keystroke, and guarded against a slow
  // older request clobbering a faster, more recent one.
  useEffect(() => {
    if (activeMeal === null || selected) return;

    const query = search.trim();
    if (!query) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);
    const requestId = ++searchRequestId.current;

    const timeout = setTimeout(() => {
      searchAllFoods(query)
        .then(({ results: data, error: blendError }) => {
          if (searchRequestId.current !== requestId) return;
          setResults(data);
          setSearchError(blendError);
        })
        .catch((err) => {
          if (searchRequestId.current === requestId) {
            setSearchError(err instanceof Error ? err.message : 'Search failed.');
          }
        })
        .finally(() => {
          if (searchRequestId.current === requestId) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [search, selected, activeMeal]);

  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const totalProtein = entries.reduce((sum, entry) => sum + (entry.protein ?? 0), 0);
  const totalCarbs = entries.reduce((sum, entry) => sum + (entry.carbs ?? 0), 0);
  const totalFat = entries.reduce((sum, entry) => sum + (entry.fat ?? 0), 0);

  const parsedQuantity = Number(quantityInput);
  const hasValidQuantity = quantityInput.trim().length > 0 && !Number.isNaN(parsedQuantity) && parsedQuantity > 0;

  const parsedCount = Number(countInput);
  const hasValidCount = countInput.trim().length > 0 && !Number.isNaN(parsedCount) && parsedCount > 0;

  const parsedCustomGrams = Number(customGramsInput);
  const hasValidCustomGrams =
    customGramsInput.trim().length > 0 && !Number.isNaN(parsedCustomGrams) && parsedCustomGrams > 0;

  const activePortion = selected?.portions[portionIndex] ?? null;

  // The one number every macro figure below actually scales off, however
  // it was entered — a plain gram amount, a count of a real structured
  // portion (e.g. "2 x 1 small apple"), or a count of a manually-entered
  // custom item weight (e.g. "1 scoop = 30g", for foods with no
  // structured portion data at all, like protein powder).
  let totalGrams: number | null = null;
  if (unitMode === 'grams') {
    totalGrams = hasValidQuantity ? parsedQuantity : null;
  } else if (unitMode === 'portion') {
    totalGrams = activePortion && hasValidCount ? activePortion.grams * parsedCount : null;
  } else {
    totalGrams = hasValidCustomGrams && hasValidCount ? parsedCustomGrams * parsedCount : null;
  }
  const hasValidTotal = totalGrams !== null && totalGrams > 0;

  const handlePrevDay = () => setLogDate((current) => addDays(current, -1));
  // No future days — there's nothing to browse ahead of today, and this
  // is a log of what's already been eaten, not a meal planner.
  const handleNextDay = () => setLogDate((current) => (current < todayISODate() ? addDays(current, 1) : current));

  const openAddEntry = (meal: Meal) => {
    setActiveMeal(meal);
    setSearch('');
    setResults([]);
    setSearchError(null);
    setSelected(null);
    setSelectedSource(null);
    setUnitMode('grams');
    setPortionIndex(0);
    setCountInput('1');
    setCustomGramsInput('');
    setQuantityInput('100');
    setFormError(null);
    setScanning(false);
    setBarcodeLoading(false);
    setBarcodeError(null);
    setShowingSavedMeals(false);
    setSavedMealError(null);
  };

  const closeModal = () => {
    setActiveMeal(null);
    setScanning(false);
    setShowingSavedMeals(false);
  };

  const handleSelectSavedMeal = async (meal: SavedMeal) => {
    if (!session || !activeMeal) return;
    setSavedMealError(null);
    setLoggingSavedMealId(meal.id);
    try {
      await logSavedMeal(session.user.id, logDate, activeMeal, meal);
      try {
        await awardMealXp(session.user.id, logDate);
      } catch (xpErr) {
        console.error('Failed to award meal XP:', xpErr);
      }
      closeModal();
      load();
    } catch (err) {
      setSavedMealError(err instanceof Error ? err.message : 'Failed to log that saved meal.');
    } finally {
      setLoggingSavedMealId(null);
    }
  };

  const openSaveMealPrompt = (meal: Meal) => {
    setSavingMealFrom(meal);
    setSaveMealName('');
    setSaveMealError(null);
  };

  const closeSaveMealPrompt = () => setSavingMealFrom(null);

  const handleConfirmSaveMeal = async () => {
    if (!session || !savingMealFrom) return;
    const name = saveMealName.trim();
    if (!name) {
      setSaveMealError('Give this meal a name.');
      return;
    }

    setSavingMeal(true);
    setSaveMealError(null);
    try {
      const mealEntries = entries.filter((entry) => entry.meal === savingMealFrom);
      await saveMealFromEntries(session.user.id, name, mealEntries);
      const refreshed = await listSavedMeals(session.user.id);
      setSavedMeals(refreshed);
      closeSaveMealPrompt();
    } catch (err) {
      setSaveMealError(err instanceof Error ? err.message : 'Failed to save this meal.');
    } finally {
      setSavingMeal(false);
    }
  };

  // Picking a result always starts back at a 100g quantity — the same
  // default whether it came from typed search or a barcode scan.
  const selectFood = (result: FoodSearchResult, source: FoodSource) => {
    setSelected(result);
    setSelectedSource(source);
    setUnitMode('grams');
    setPortionIndex(0);
    setCountInput('1');
    setCustomGramsInput('');
    setQuantityInput('100');
    setFormError(null);
  };

  const handleOpenScanner = async () => {
    setBarcodeError(null);
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setBarcodeError(
          result.canAskAgain
            ? 'Camera access is needed to scan a barcode.'
            : 'Camera access was denied — enable it for this app in your device settings, or search instead.'
        );
        return;
      }
    }
    hasScannedRef.current = false;
    setScanning(true);
  };

  // CameraView keeps firing this repeatedly while the same barcode stays
  // in frame — the ref guard makes sure only the first detection per
  // scan session actually triggers a lookup.
  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    setScanning(false);
    setBarcodeLoading(true);
    setBarcodeError(null);

    getProductByBarcode(data)
      .then((product) => {
        if (product) {
          selectFood(product, 'open_food_facts');
        } else {
          setBarcodeError(`Barcode ${data} wasn't found in Open Food Facts — try searching instead.`);
        }
      })
      .catch((err) => {
        setBarcodeError(err instanceof Error ? err.message : 'Failed to look up that barcode.');
      })
      .finally(() => setBarcodeLoading(false));
  };

  const handleSave = async () => {
    setFormError(null);
    if (!session || !activeMeal || !selected || !selectedSource) return;

    if (totalGrams === null || totalGrams <= 0) {
      setFormError('Enter a valid quantity before logging this.');
      return;
    }

    setSaving(true);
    try {
      await addFoodLog(session.user.id, logDate, activeMeal, {
        name: selected.brand ? `${selected.name} (${selected.brand})` : selected.name,
        quantityGrams: totalGrams,
        calories: Math.round(scaleMacro(selected.caloriesPer100g, totalGrams) ?? 0),
        protein: scaleMacro(selected.proteinPer100g, totalGrams),
        carbs: scaleMacro(selected.carbsPer100g, totalGrams),
        fat: scaleMacro(selected.fatPer100g, totalGrams),
        source: selectedSource,
        sourceId: selected.id || null,
      });
      // Only the day's first meal actually awards XP — the database
      // silently rejects the rest, so it's always safe to call this.
      try {
        await awardMealXp(session.user.id, logDate);
      } catch (xpErr) {
        console.error('Failed to award meal XP:', xpErr);
      }
      closeModal();
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong saving this entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (logId: string) => {
    setDeletingId(logId);
    try {
      await deleteFoodLog(logId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete that entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const openEditEntry = (entry: FoodLogEntry) => {
    setEditingEntry(entry);
    setEditQuantityInput(String(round(entry.quantityGrams)));
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingEntry(null);
    setEditQuantityInput('');
    setEditError(null);
  };

  const parsedEditQuantity = Number(editQuantityInput);
  const hasValidEditQuantity =
    editQuantityInput.trim().length > 0 && !Number.isNaN(parsedEditQuantity) && parsedEditQuantity > 0;

  const handleSaveEditQuantity = async () => {
    if (!editingEntry || !hasValidEditQuantity) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateFoodLogQuantity(editingEntry, parsedEditQuantity);
      closeEditModal();
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update that entry.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="restaurant-outline" size={20} color={Accent} />
              <ThemedText type="title" style={styles.title}>
                Nutrition
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={() => router.push('/client/saved-meals')} hitSlop={8}>
                <ThemedText type="linkPrimary" style={styles.savedMealsLink}>
                  Saved Meals
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => openAddEntry(currentMealByTime())}
                hitSlop={8}
                accessibilityLabel="Quick-add a food">
                <Ionicons name="search-outline" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.dateNavRow}>
            <Pressable onPress={handlePrevDay} style={styles.dateNavButton} hitSlop={8}>
              <ThemedText type="smallBold" style={styles.dateNavButtonText}>
                ‹
              </ThemedText>
            </Pressable>
            <View style={styles.dateNavLabelWrap}>
              {isToday && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.todayCaption}>
                  Today
                </ThemedText>
              )}
              <ThemedText style={styles.date}>{formatDisplayDate(logDate)}</ThemedText>
            </View>
            <Pressable onPress={handleNextDay} style={styles.dateNavButton} disabled={isToday} hitSlop={8}>
              <ThemedText type="smallBold" style={[styles.dateNavButtonText, isToday && styles.dateNavButtonTextDisabled]}>
                ›
              </ThemedText>
            </Pressable>
          </View>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && !error && (
            <View style={styles.summaryGlow}>
              <ThemedView type="backgroundElement" style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <CalorieRing current={totalCalories} target={target?.targetCalories ?? null} />
                  {macroTargets ? (
                    <View style={styles.macroBars}>
                      <MacroBar label="Protein" current={totalProtein} target={macroTargets.proteinGrams} />
                      <MacroBar label="Carbs" current={totalCarbs} target={macroTargets.carbsGrams} />
                      <MacroBar label="Fats" current={totalFat} target={macroTargets.fatGrams} />
                    </View>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.noTargetMeta}>
                      Log your weight and meals daily — once there's enough history, your real calorie and macro
                      targets show here.
                    </ThemedText>
                  )}
                </View>

                {target && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.targetMeta}>
                    {goalLabel(target.goalType)}
                    {target.goalType && target.modifierPercent !== 0
                      ? ` (${target.modifierPercent > 0 ? '+' : ''}${round(target.modifierPercent)}% of TDEE)`
                      : ''}
                    {' · TDEE '}
                    {Math.round(target.estimatedTdee)} kcal
                  </ThemedText>
                )}
              </ThemedView>
            </View>
          )}

          {!loading &&
            !error &&
            MEALS.map(({ key, label }) => {
              const mealEntries = entries.filter((entry) => entry.meal === key);
              const mealTotal = mealEntries.reduce((sum, entry) => sum + entry.calories, 0);
              return (
                <View key={key} style={styles.mealSection}>
                  <View style={styles.mealHeader}>
                    <ThemedText type="smallBold">{label}</ThemedText>
                    <View style={styles.mealHeaderRight}>
                      {mealEntries.length > 0 && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {mealTotal} cal
                        </ThemedText>
                      )}
                      {mealEntries.length > 0 && (
                        <Pressable onPress={() => openSaveMealPrompt(key)}>
                          <ThemedText type="small" style={styles.saveMealLink}>
                            Save as meal
                          </ThemedText>
                        </Pressable>
                      )}
                      <Pressable onPress={() => openAddEntry(key)}>
                        <ThemedText type="linkPrimary">+ Add</ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  {mealEntries.length === 0 ? (
                    <ThemedText themeColor="textSecondary" type="small">
                      Nothing logged yet.
                    </ThemedText>
                  ) : (
                    mealEntries.map((entry) => (
                      <ThemedView key={entry.id} type="backgroundElement" style={styles.entryRow}>
                        <View style={styles.entryInfo}>
                          <ThemedText type="small">{entry.foodName}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {macroSummary(entry)}
                          </ThemedText>
                        </View>
                        <View style={styles.entryActions}>
                          <Pressable onPress={() => openEditEntry(entry)}>
                            <ThemedText type="small" style={styles.editText}>
                              Edit
                            </ThemedText>
                          </Pressable>
                          <Pressable onPress={() => handleDeleteEntry(entry.id)} disabled={deletingId === entry.id}>
                            {deletingId === entry.id ? (
                              <ActivityIndicator size="small" color={Accent} />
                            ) : (
                              <ThemedText type="small" style={styles.deleteText}>
                                Delete
                              </ThemedText>
                            )}
                          </Pressable>
                        </View>
                      </ThemedView>
                    ))
                  )}
                </View>
              );
            })}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={activeMeal !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Add to {MEALS.find((m) => m.key === activeMeal)?.label}
            </ThemedText>

            {scanning ? (
              <>
                <View style={styles.cameraContainer}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODE_TYPES] }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.scanHint}>
                  Point the camera at the product's barcode.
                </ThemedText>
                <Pressable onPress={() => setScanning(false)}>
                  <ThemedText type="linkPrimary">Cancel scan</ThemedText>
                </Pressable>
              </>
            ) : !selected && showingSavedMeals ? (
              <>
                <Pressable onPress={() => setShowingSavedMeals(false)} style={styles.scanButton}>
                  <ThemedText type="linkPrimary">← Back to search</ThemedText>
                </Pressable>

                {savedMealError && <ThemedText style={styles.error}>{savedMealError}</ThemedText>}

                {savedMeals.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.noResults}>
                    No saved meals yet -- log some food here, then use "Save as meal" to create one.
                  </ThemedText>
                ) : (
                  <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                    {savedMeals.map((meal) => {
                      const totalCalories = meal.items.reduce((sum, item) => sum + item.calories, 0);
                      return (
                        <Pressable
                          key={meal.id}
                          onPress={() => handleSelectSavedMeal(meal)}
                          disabled={loggingSavedMealId === meal.id}>
                          <View style={styles.resultRow}>
                            <View style={styles.entryInfo}>
                              <ThemedText type="small" style={styles.resultName}>
                                {meal.name}
                              </ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                {meal.items.length} item{meal.items.length === 1 ? '' : 's'} ·{' '}
                                {Math.round(totalCalories)} cal
                              </ThemedText>
                            </View>
                            {loggingSavedMealId === meal.id && <ActivityIndicator size="small" />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            ) : !selected ? (
              <>
                <View style={styles.modalActionRow}>
                  <Pressable onPress={handleOpenScanner} style={styles.scanButton}>
                    <ThemedText type="linkPrimary">📷 Scan a barcode instead</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setShowingSavedMeals(true)} style={styles.scanButton}>
                    <ThemedText type="linkPrimary">📋 Use a saved meal</ThemedText>
                  </Pressable>
                </View>

                {barcodeLoading && <ActivityIndicator style={styles.searchLoader} />}
                {!barcodeLoading && barcodeError && <ThemedText style={styles.error}>{barcodeError}</ThemedText>}

                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search foods"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />

                {searching && <ActivityIndicator style={styles.searchLoader} />}
                {!searching && searchError && <ThemedText style={styles.error}>{searchError}</ThemedText>}
                {!searching && !searchError && search.trim().length > 0 && results.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.noResults}>
                    No matches found.
                  </ThemedText>
                )}

                <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                  {results.map((result) => (
                    <Pressable key={`${result.source}-${result.id || result.name}`} onPress={() => selectFood(result, result.source)}>
                      <View style={styles.resultRow}>
                        <ThemedText type="small" style={styles.resultName}>
                          {result.name}
                          {result.brand ? ` (${result.brand})` : ''}
                          {result.source === 'open_food_facts' ? ' 🇬🇧' : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {Math.round(result.caloriesPer100g)} cal / 100g
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <ThemedText type="smallBold">
                  {selected.name}
                  {selected.brand ? ` (${selected.brand})` : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Per 100g: {Math.round(selected.caloriesPer100g)} cal
                  {selected.proteinPer100g !== null ? ` · ${round(selected.proteinPer100g)}g protein` : ''}
                  {selected.carbsPer100g !== null ? ` · ${round(selected.carbsPer100g)}g carbs` : ''}
                  {selected.fatPer100g !== null ? ` · ${round(selected.fatPer100g)}g fat` : ''}
                </ThemedText>

                <ThemedText type="smallBold" style={styles.sectionLabel}>
                  Quantity
                </ThemedText>
                <View style={styles.unitRow}>
                  <Pressable
                    onPress={() => setUnitMode('grams')}
                    style={[styles.unitChip, unitMode === 'grams' && styles.unitChipActive]}>
                    <ThemedText type="small" style={unitMode === 'grams' ? styles.unitChipTextActive : undefined}>
                      Grams
                    </ThemedText>
                  </Pressable>
                  {selected.portions.map((portion, index) => (
                    <Pressable
                      key={portion.label}
                      onPress={() => {
                        setUnitMode('portion');
                        setPortionIndex(index);
                      }}
                      style={[styles.unitChip, unitMode === 'portion' && portionIndex === index && styles.unitChipActive]}>
                      <ThemedText
                        type="small"
                        style={unitMode === 'portion' && portionIndex === index ? styles.unitChipTextActive : undefined}>
                        {portion.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => setUnitMode('custom')}
                    style={[styles.unitChip, unitMode === 'custom' && styles.unitChipActive]}>
                    <ThemedText type="small" style={unitMode === 'custom' ? styles.unitChipTextActive : undefined}>
                      Custom item
                    </ThemedText>
                  </Pressable>
                </View>

                {unitMode === 'grams' && (
                  <TextInput
                    value={quantityInput}
                    onChangeText={setQuantityInput}
                    placeholder="100"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                  />
                )}

                {unitMode === 'portion' && activePortion && (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      {activePortion.label} = {round(activePortion.grams)}g each
                    </ThemedText>
                    <TextInput
                      value={countInput}
                      onChangeText={setCountInput}
                      placeholder="1"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="decimal-pad"
                      style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    />
                  </>
                )}

                {unitMode === 'custom' && (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      Grams per item (check the packaging, or estimate)
                    </ThemedText>
                    <TextInput
                      value={customGramsInput}
                      onChangeText={setCustomGramsInput}
                      placeholder="e.g. 30"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="decimal-pad"
                      style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    />
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                      How many
                    </ThemedText>
                    <TextInput
                      value={countInput}
                      onChangeText={setCountInput}
                      placeholder="1"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="decimal-pad"
                      style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    />
                  </>
                )}

                {hasValidTotal ? (
                  <ThemedText type="smallBold">
                    For {round(totalGrams as number)}g: {Math.round(scaleMacro(selected.caloriesPer100g, totalGrams as number) ?? 0)} cal
                    {selected.proteinPer100g !== null
                      ? ` · ${round(scaleMacro(selected.proteinPer100g, totalGrams as number) as number)}g protein`
                      : ''}
                    {selected.carbsPer100g !== null
                      ? ` · ${round(scaleMacro(selected.carbsPer100g, totalGrams as number) as number)}g carbs`
                      : ''}
                    {selected.fatPer100g !== null
                      ? ` · ${round(scaleMacro(selected.fatPer100g, totalGrams as number) as number)}g fat`
                      : ''}
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.error}>Enter a valid quantity.</ThemedText>
                )}

                <Pressable
                  onPress={() => {
                    setSelected(null);
                    setSelectedSource(null);
                  }}>
                  <ThemedText type="linkPrimary">← Search again</ThemedText>
                </Pressable>
              </>
            )}

            {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

            {selected && (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={handleSave}
                disabled={saving || !hasValidTotal}>
                {saving ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    Log this
                  </ThemedText>
                )}
              </Pressable>
            )}

            <Pressable style={styles.cancelButton} onPress={closeModal}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <Modal visible={savingMealFrom !== null} transparent animationType="fade" onRequestClose={closeSaveMealPrompt}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Save {savingMealFrom ? MEALS.find((m) => m.key === savingMealFrom)?.label : ''} as a meal
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
              Give it a name so you can log the whole thing again in one tap later.
            </ThemedText>

            <TextInput
              value={saveMealName}
              onChangeText={setSaveMealName}
              placeholder="e.g. My protein breakfast"
              placeholderTextColor={theme.textSecondary}
              autoFocus
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />

            {saveMealError && <ThemedText style={styles.error}>{saveMealError}</ThemedText>}

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={handleConfirmSaveMeal}
              disabled={savingMeal}>
              {savingMeal ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  Save
                </ThemedText>
              )}
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={closeSaveMealPrompt}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <Modal visible={editingEntry !== null} transparent animationType="fade" onRequestClose={closeEditModal}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Edit {editingEntry?.foodName}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
              Change how many grams you actually had — calories and macros rescale automatically.
            </ThemedText>

            <TextInput
              value={editQuantityInput}
              onChangeText={setEditQuantityInput}
              placeholder="100"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              autoFocus
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />

            {editError && <ThemedText style={styles.error}>{editError}</ThemedText>}

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={handleSaveEditQuantity}
              disabled={savingEdit || !hasValidEditQuantity}>
              {savingEdit ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  Save
                </ThemedText>
              )}
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={closeEditModal}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  savedMealsLink: {
    fontSize: 14,
  },
  title: {},
  date: {
    textAlign: 'center',
  },
  todayCaption: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryGlow: {
    ...Glow.teal,
    borderRadius: Spacing.four,
  },
  summaryCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  macroBars: {
    flex: 1,
    gap: Spacing.two,
  },
  noTargetMeta: {
    flex: 1,
  },
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateNavButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  dateNavButtonText: {
    fontSize: 24,
  },
  dateNavButtonTextDisabled: {
    opacity: 0.3,
  },
  dateNavLabelWrap: {
    flex: 1,
    alignItems: 'center',
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  targetMeta: {
    textAlign: 'center',
  },
  mealSection: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  entryInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  entryActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  editText: {
    color: Colors.tealBright,
  },
  deleteText: {
    color: Colors.textSecondary,
  },
  saveMealLink: {
    color: Colors.tealBright,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalTitle: {
    marginBottom: Spacing.two,
  },
  modalSubtitle: {
    marginTop: -Spacing.one,
    marginBottom: Spacing.one,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  unitChip: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  unitChipActive: {
    backgroundColor: Accent,
    borderColor: Accent,
  },
  unitChipTextActive: {
    color: Colors.text,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  searchLoader: {
    marginVertical: Spacing.two,
  },
  modalActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  scanButton: {
    alignSelf: 'flex-start',
  },
  cameraContainer: {
    height: 300,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  scanHint: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  noResults: {
    textAlign: 'center',
    marginVertical: Spacing.two,
  },
  resultsList: {
    maxHeight: 280,
  },
  resultRow: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
    gap: Spacing.half,
  },
  resultName: {
    fontWeight: '700',
  },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
