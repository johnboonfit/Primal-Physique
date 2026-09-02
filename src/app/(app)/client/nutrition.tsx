import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { MacroRing } from '@/components/macro-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { addFoodLog, listFoodLogsForDate, type FoodLogEntry, type FoodSource, type Meal } from '@/lib/food-logs';
import { getProductByBarcode, type FoodSearchResult } from '@/lib/open-food-facts';
import { searchFoods } from '@/lib/usda-fooddata';
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

function todayDisplayDate() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function round(value: number) {
  return Math.round(value * 10) / 10;
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
  const logDate = todayISODate();

  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeMeal, setActiveMeal] = useState<Meal | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [selectedSource, setSelectedSource] = useState<FoodSource | null>(null);
  const [quantityInput, setQuantityInput] = useState('100');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const hasScannedRef = useRef(false);

  const searchRequestId = useRef(0);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listFoodLogsForDate(session.user.id, logDate)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load today's food log."))
      .finally(() => setLoading(false));
  }, [session, logDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live search against USDA FoodData Central — debounced so it doesn't
  // fire on every keystroke, and guarded against a slow older request
  // clobbering a faster, more recent one.
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
      searchFoods(query)
        .then((data) => {
          if (searchRequestId.current === requestId) setResults(data);
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

  // This app has no macro targets to track progress against, so each
  // ring instead fills to show that macro's share of today's total
  // calories (grams × its kcal/g, over total calories) — a real number
  // from what's actually logged, not a fabricated goal.
  const proteinShare = totalCalories > 0 ? (totalProtein * 4) / totalCalories : 0;
  const carbsShare = totalCalories > 0 ? (totalCarbs * 4) / totalCalories : 0;
  const fatShare = totalCalories > 0 ? (totalFat * 9) / totalCalories : 0;

  const parsedQuantity = Number(quantityInput);
  const hasValidQuantity = quantityInput.trim().length > 0 && !Number.isNaN(parsedQuantity) && parsedQuantity > 0;

  const openAddEntry = (meal: Meal) => {
    setActiveMeal(meal);
    setSearch('');
    setResults([]);
    setSearchError(null);
    setSelected(null);
    setSelectedSource(null);
    setQuantityInput('100');
    setFormError(null);
    setScanning(false);
    setBarcodeLoading(false);
    setBarcodeError(null);
  };

  const closeModal = () => {
    setActiveMeal(null);
    setScanning(false);
  };

  // Picking a result always starts back at a 100g quantity — the same
  // default whether it came from typed search or a barcode scan.
  const selectFood = (result: FoodSearchResult, source: FoodSource) => {
    setSelected(result);
    setSelectedSource(source);
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

    const quantityGrams = Number(quantityInput);
    if (!quantityInput.trim() || Number.isNaN(quantityGrams) || quantityGrams <= 0) {
      setFormError('Enter the quantity as a number of grams greater than 0.');
      return;
    }

    setSaving(true);
    try {
      await addFoodLog(session.user.id, logDate, activeMeal, {
        name: selected.brand ? `${selected.name} (${selected.brand})` : selected.name,
        quantityGrams,
        calories: Math.round(scaleMacro(selected.caloriesPer100g, quantityGrams) ?? 0),
        protein: scaleMacro(selected.proteinPer100g, quantityGrams),
        carbs: scaleMacro(selected.carbsPer100g, quantityGrams),
        fat: scaleMacro(selected.fatPer100g, quantityGrams),
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Nutrition
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.date}>
            {todayDisplayDate()}
          </ThemedText>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && !error && <HeroStat value={totalCalories} label="Calories Today" />}

          {!loading && !error && entries.length > 0 && (
            <View style={styles.macroRow}>
              <MacroRing value={round(totalProtein)} label="Protein" progress={proteinShare} />
              <MacroRing value={round(totalCarbs)} label="Carbs" progress={carbsShare} />
              <MacroRing value={round(totalFat)} label="Fat" progress={fatShare} />
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
                        <ThemedText type="small">{entry.foodName}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {macroSummary(entry)}
                        </ThemedText>
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
            ) : !selected ? (
              <>
                <Pressable onPress={handleOpenScanner} style={styles.scanButton}>
                  <ThemedText type="linkPrimary">📷 Scan a barcode instead</ThemedText>
                </Pressable>

                {barcodeLoading && <ActivityIndicator style={styles.searchLoader} />}
                {!barcodeLoading && barcodeError && <ThemedText style={styles.error}>{barcodeError}</ThemedText>}

                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search USDA FoodData Central"
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
                    <Pressable key={result.id || result.name} onPress={() => selectFood(result, 'usda_fdc')}>
                      <View style={styles.resultRow}>
                        <ThemedText type="small" style={styles.resultName}>
                          {result.name}
                          {result.brand ? ` (${result.brand})` : ''}
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
                  Quantity (grams)
                </ThemedText>
                <TextInput
                  value={quantityInput}
                  onChangeText={setQuantityInput}
                  placeholder="100"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />

                {hasValidQuantity ? (
                  <ThemedText type="smallBold">
                    For {parsedQuantity}g: {Math.round(scaleMacro(selected.caloriesPer100g, parsedQuantity) ?? 0)} cal
                    {selected.proteinPer100g !== null
                      ? ` · ${round(scaleMacro(selected.proteinPer100g, parsedQuantity) as number)}g protein`
                      : ''}
                    {selected.carbsPer100g !== null
                      ? ` · ${round(scaleMacro(selected.carbsPer100g, parsedQuantity) as number)}g carbs`
                      : ''}
                    {selected.fatPer100g !== null
                      ? ` · ${round(scaleMacro(selected.fatPer100g, parsedQuantity) as number)}g fat`
                      : ''}
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.error}>Enter a valid quantity in grams.</ThemedText>
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
                disabled={saving || !hasValidQuantity}>
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
  title: {
    marginBottom: Spacing.half,
  },
  date: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
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
  sectionLabel: {
    marginTop: Spacing.two,
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
  scanButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.two,
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
