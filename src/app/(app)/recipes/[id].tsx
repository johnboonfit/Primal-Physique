import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { NutriScoreBadge } from '@/components/nutri-score-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import type { FoodSource } from '@/lib/food-logs';
import { computeNutriScore } from '@/lib/nutri-score';
import {
  addRecipeIngredient,
  deleteRecipe,
  getRecipeDetail,
  removeRecipeIngredient,
  uploadRecipePhoto,
  type RecipeDetail,
} from '@/lib/recipes';
import { searchFoods } from '@/lib/usda-fooddata';

const SEARCH_DEBOUNCE_MS = 400;

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  base64: true,
  quality: 0.7,
  allowsEditing: true,
  aspect: [4, 3],
};

function round(value: number) {
  return Math.round(value * 10) / 10;
}

/** Scales a per-100g figure to a given quantity in grams -- e.g. 165
 * cal/100g at 150g is 165 * (150 / 100) = 247.5. Same helper as
 * nutrition.tsx uses for logging food, applied here to caching an
 * ingredient's macros into a recipe instead. */
function scaleMacro(per100g: number | null, grams: number): number | null {
  if (per100g === null) return null;
  return per100g * (grams / 100);
}

type SearchResult = Awaited<ReturnType<typeof searchFoods>>[number];

/** Nutri-Score is a per-100g property of the food itself, independent of
 * how much of it ends up in the recipe -- so a search result's grade is
 * computed straight off its per-100g figures, before any quantity is
 * even chosen. */
function nutriScoreForResult(result: SearchResult) {
  return computeNutriScore({
    caloriesPer100g: result.caloriesPer100g,
    sugarsPer100g: result.sugarsPer100g,
    saturatedFatPer100g: result.saturatedFatPer100g,
    sodiumMgPer100g: result.sodiumMgPer100g,
    fiberPer100g: result.fiberPer100g,
    proteinPer100g: result.proteinPer100g,
    fruitVegLegumeNutPercent: result.fruitVegLegumeNutPercent,
  });
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { session } = useAuth();

  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deletingRecipe, setDeletingRecipe] = useState(false);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantityInput, setQuantityInput] = useState('100');
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [ingredientError, setIngredientError] = useState<string | null>(null);
  const [sortByNutriScore, setSortByNutriScore] = useState(false);

  const searchRequestId = useRef(0);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getRecipeDetail(id)
      .then(setRecipe)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this recipe.'))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!pickerVisible || selected) return;

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
  }, [search, selected, pickerVisible]);

  // Each result's grade is a fixed property of the food (per-100g),
  // computed once per results list rather than recomputed on every
  // render or every sort toggle flip.
  const scoredResults = useMemo(
    () => results.map((result) => ({ result, nutriScore: nutriScoreForResult(result) })),
    [results]
  );

  const displayedResults = useMemo(() => {
    if (!sortByNutriScore) return scoredResults;
    // Best grade first (lowest score wins); USDA's own relevance order
    // is the tiebreaker, since Array.prototype.sort is stable.
    return [...scoredResults].sort((a, b) => a.nutriScore.score - b.nutriScore.score);
  }, [scoredResults, sortByNutriScore]);

  const openIngredientPicker = () => {
    setSearch('');
    setResults([]);
    setSearchError(null);
    setSelected(null);
    setQuantityInput('100');
    setIngredientError(null);
    setSortByNutriScore(false);
    setPickerVisible(true);
  };

  const closeIngredientPicker = () => setPickerVisible(false);

  const handlePickPhoto = async (source: 'camera' | 'library') => {
    if (!session || !recipe) return;
    setPhotoError(null);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(
        source === 'camera'
          ? 'Camera access is needed to take a photo.'
          : 'Photo library access is needed to choose a photo.'
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setUploadingPhoto(true);
    try {
      await uploadRecipePhoto(session.user.id, recipe.id, result.assets[0].base64);
      load();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Something went wrong uploading that photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveIngredient = async (ingredientId: string) => {
    setRemovingId(ingredientId);
    try {
      await removeRecipeIngredient(ingredientId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove that ingredient.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleConfirmDeleteRecipe = async () => {
    if (!recipe) return;
    setDeletingRecipe(true);
    try {
      await deleteRecipe(recipe.id, recipe.photoStoragePath);
      router.replace('/recipes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete this recipe.');
      setDeletingRecipe(false);
    }
  };

  const selectResult = (result: SearchResult) => {
    setSelected(result);
    setQuantityInput('100');
    setIngredientError(null);
  };

  const parsedQuantity = Number(quantityInput);
  const hasValidQuantity = quantityInput.trim().length > 0 && !Number.isNaN(parsedQuantity) && parsedQuantity > 0;

  const handleSaveIngredient = async () => {
    setIngredientError(null);
    if (!recipe || !selected || !hasValidQuantity) return;

    setSavingIngredient(true);
    try {
      const source: FoodSource = 'usda_fdc';
      await addRecipeIngredient(
        recipe.id,
        {
          name: selected.brand ? `${selected.name} (${selected.brand})` : selected.name,
          quantityGrams: parsedQuantity,
          calories: Math.round(scaleMacro(selected.caloriesPer100g, parsedQuantity) ?? 0),
          protein: scaleMacro(selected.proteinPer100g, parsedQuantity),
          carbs: scaleMacro(selected.carbsPer100g, parsedQuantity),
          fat: scaleMacro(selected.fatPer100g, parsedQuantity),
          sugars: scaleMacro(selected.sugarsPer100g, parsedQuantity),
          saturatedFat: scaleMacro(selected.saturatedFatPer100g, parsedQuantity),
          sodiumMg: scaleMacro(selected.sodiumMgPer100g, parsedQuantity),
          fiber: scaleMacro(selected.fiberPer100g, parsedQuantity),
          // Not scaled -- see RecipeIngredientDraft.fruitVegLegumeNutPercent.
          fruitVegLegumeNutPercent: selected.fruitVegLegumeNutPercent,
          source,
          sourceId: selected.id || null,
        },
        recipe.ingredients.length
      );
      setPickerVisible(false);
      load();
    } catch (err) {
      setIngredientError(err instanceof Error ? err.message : 'Something went wrong adding that ingredient.');
    } finally {
      setSavingIngredient(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && recipe && (
            <>
              {recipe.photoUrl ? (
                <Image source={{ uri: recipe.photoUrl }} style={styles.coverImage} contentFit="cover" />
              ) : (
                <ThemedView type="backgroundElement" style={[styles.coverImage, styles.coverPlaceholder]}>
                  <ThemedText themeColor="textSecondary" type="small">
                    No cover photo
                  </ThemedText>
                </ThemedView>
              )}

              <View style={styles.photoButtonRow}>
                <Pressable onPress={() => handlePickPhoto('camera')} disabled={uploadingPhoto}>
                  <ThemedText type="linkPrimary">Take photo</ThemedText>
                </Pressable>
                <Pressable onPress={() => handlePickPhoto('library')} disabled={uploadingPhoto}>
                  <ThemedText type="linkPrimary">Choose from library</ThemedText>
                </Pressable>
              </View>
              {uploadingPhoto && <ActivityIndicator style={styles.smallLoader} />}
              {photoError && <ThemedText style={styles.error}>{photoError}</ThemedText>}

              <View style={styles.titleRow}>
                <ThemedText type="title" style={styles.title}>
                  {recipe.name}
                </ThemedText>
                <Pressable onPress={() => router.push(`/recipes/edit/${recipe.id}`)}>
                  <ThemedText type="linkPrimary">Edit</ThemedText>
                </Pressable>
              </View>
              <ThemedText themeColor="textSecondary" style={styles.meta}>
                {recipe.prepMinutes + recipe.cookMinutes} min total ({recipe.prepMinutes} prep · {recipe.cookMinutes}{' '}
                cook) · {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}
              </ThemedText>
              {recipe.tags.length > 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.tags}>
                  {recipe.tags.join(' · ')}
                </ThemedText>
              )}

              <ThemedView type="backgroundElement" style={styles.macroCard}>
                <View style={styles.macroCardHeaderRow}>
                  <ThemedText type="smallBold">Per serving (calculated)</ThemedText>
                  {recipe.nutriScore && (
                    <View style={styles.nutriScoreRow}>
                      <NutriScoreBadge grade={recipe.nutriScore.grade} size="large" />
                    </View>
                  )}
                </View>
                {recipe.ingredients.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Add ingredients below to see this.
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="smallBold" style={styles.macroHero}>
                      {Math.round(recipe.caloriesPerServing)} cal
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {round(recipe.proteinPerServing)}g protein · {round(recipe.carbsPerServing)}g carbs ·{' '}
                      {round(recipe.fatPerServing)}g fat
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.macroTotalsHint}>
                      Whole recipe ({recipe.servings} servings): {Math.round(recipe.totalCalories)} cal ·{' '}
                      {round(recipe.totalProtein)}g protein · {round(recipe.totalCarbs)}g carbs ·{' '}
                      {round(recipe.totalFat)}g fat
                    </ThemedText>
                    {recipe.nutriScoreGramsPerServing !== null && (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.macroTotalsHint}>
                        Nutri-Score {recipe.nutriScore?.grade} is graded per 100g of this recipe (each serving is
                        ~{Math.round(recipe.nutriScoreGramsPerServing)}g) -- the same basis every real product's
                        badge uses.
                      </ThemedText>
                    )}
                  </>
                )}
              </ThemedView>

              <View style={styles.sectionHeaderRow}>
                <ThemedText type="smallBold">Ingredients</ThemedText>
                <Pressable onPress={openIngredientPicker}>
                  <ThemedText type="linkPrimary">+ Add ingredient</ThemedText>
                </Pressable>
              </View>

              {recipe.ingredients.length === 0 ? (
                <ThemedText themeColor="textSecondary" type="small">
                  No ingredients yet.
                </ThemedText>
              ) : (
                recipe.ingredients.map((ingredient) => (
                  <ThemedView key={ingredient.id} type="backgroundElement" style={styles.ingredientRow}>
                    <View style={styles.ingredientInfo}>
                      <ThemedText type="small">{ingredient.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {round(ingredient.quantityGrams)}g · {Math.round(ingredient.calories)} cal
                        {ingredient.protein !== null ? ` · ${round(ingredient.protein)}g protein` : ''}
                        {ingredient.carbs !== null ? ` · ${round(ingredient.carbs)}g carbs` : ''}
                        {ingredient.fat !== null ? ` · ${round(ingredient.fat)}g fat` : ''}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => handleRemoveIngredient(ingredient.id)}
                      disabled={removingId === ingredient.id}>
                      {removingId === ingredient.id ? (
                        <ActivityIndicator size="small" color={Accent} />
                      ) : (
                        <ThemedText type="small" style={styles.removeText}>
                          Remove
                        </ThemedText>
                      )}
                    </Pressable>
                  </ThemedView>
                ))
              )}

              <ThemedText type="smallBold" style={styles.sectionHeaderRow}>
                Instructions
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.instructions}>
                {recipe.instructions || 'No instructions added yet.'}
              </ThemedText>

              <Pressable style={styles.deleteRecipeButton} onPress={() => setDeleteConfirmVisible(true)}>
                <ThemedText type="small" style={styles.removeText}>
                  Delete this recipe
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={closeIngredientPicker}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Add ingredient
            </ThemedText>

            {!selected ? (
              <>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search USDA FoodData Central"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />

                {searching && <ActivityIndicator style={styles.smallLoader} />}
                {!searching && searchError && <ThemedText style={styles.error}>{searchError}</ThemedText>}
                {!searching && !searchError && search.trim().length > 0 && results.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.noResults}>
                    No matches found.
                  </ThemedText>
                )}

                {results.length > 0 && (
                  <Pressable onPress={() => setSortByNutriScore((current) => !current)} style={styles.sortToggle}>
                    <ThemedText type="small" style={styles.sortToggleText}>
                      {sortByNutriScore ? '✓ Sorted by Nutri-Score (best first)' : 'Sort by Nutri-Score'}
                    </ThemedText>
                  </Pressable>
                )}

                <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                  {displayedResults.map(({ result, nutriScore }) => (
                    <Pressable key={result.id || result.name} onPress={() => selectResult(result)}>
                      <View style={styles.resultRow}>
                        <NutriScoreBadge grade={nutriScore.grade} size="small" />
                        <View style={styles.resultInfo}>
                          <ThemedText type="small" style={styles.resultName}>
                            {result.name}
                            {result.brand ? ` (${result.brand})` : ''}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {Math.round(result.caloriesPer100g)} cal / 100g
                          </ThemedText>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.selectedHeaderRow}>
                  <NutriScoreBadge grade={nutriScoreForResult(selected).grade} size="small" />
                  <ThemedText type="smallBold">
                    {selected.name}
                    {selected.brand ? ` (${selected.brand})` : ''}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Per 100g: {Math.round(selected.caloriesPer100g)} cal
                  {selected.proteinPer100g !== null ? ` · ${round(selected.proteinPer100g)}g protein` : ''}
                  {selected.carbsPer100g !== null ? ` · ${round(selected.carbsPer100g)}g carbs` : ''}
                  {selected.fatPer100g !== null ? ` · ${round(selected.fatPer100g)}g fat` : ''}
                </ThemedText>

                <ThemedText type="smallBold" style={styles.sectionLabel}>
                  Quantity used in this recipe (grams)
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

                <Pressable onPress={() => setSelected(null)}>
                  <ThemedText type="linkPrimary">← Search again</ThemedText>
                </Pressable>
              </>
            )}

            {ingredientError && <ThemedText style={styles.error}>{ingredientError}</ThemedText>}

            {selected && (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={handleSaveIngredient}
                disabled={savingIngredient || !hasValidQuantity}>
                {savingIngredient ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    Add to recipe
                  </ThemedText>
                )}
              </Pressable>
            )}

            <Pressable style={styles.cancelButton} onPress={closeIngredientPicker}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={deleteConfirmVisible}
        title="Delete this recipe?"
        message={recipe ? `"${recipe.name}" and its ingredient list will be permanently removed.` : ''}
        confirmLabel="Delete"
        busy={deletingRecipe}
        onConfirm={handleConfirmDeleteRecipe}
        onCancel={() => setDeleteConfirmVisible(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: {
    paddingBottom: Spacing.four,
  },
  backButton: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  smallLoader: {
    marginVertical: Spacing.one,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  coverImage: {
    width: '100%',
    height: 180,
    borderRadius: Spacing.two,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  meta: {
    marginTop: Spacing.half,
  },
  tags: {
    marginTop: Spacing.half,
  },
  macroCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.three,
    gap: Spacing.half,
  },
  macroCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nutriScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  macroHero: {
    fontSize: 22,
  },
  macroTotalsHint: {
    marginTop: Spacing.one,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  ingredientInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  removeText: {
    color: Colors.textSecondary,
  },
  instructions: {
    marginTop: Spacing.half,
  },
  deleteRecipeButton: {
    alignItems: 'center',
    marginTop: Spacing.five,
    paddingVertical: Spacing.two,
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
  noResults: {
    textAlign: 'center',
    marginVertical: Spacing.two,
  },
  resultsList: {
    maxHeight: 280,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
    gap: Spacing.two,
  },
  resultInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  selectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  resultName: {
    fontWeight: '700',
  },
  sortToggle: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.one,
  },
  sortToggleText: {
    color: Accent,
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
