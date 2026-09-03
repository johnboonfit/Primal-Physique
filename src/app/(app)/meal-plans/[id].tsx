import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  addMealPlanItem,
  deleteMealPlanTemplate,
  getMealPlanTemplateDetail,
  MEAL_SLOTS,
  removeMealPlanItem,
  type MealPlanTemplateDetail,
  type MealSlot,
} from '@/lib/meal-plans';
import { GOAL_TYPES } from '@/lib/programmes';
import { listRecipes, type RecipeSummary } from '@/lib/recipes';

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function goalLabel(goalType: MealPlanTemplateDetail['goalType']) {
  return GOAL_TYPES.find((g) => g.key === goalType)?.label ?? goalType;
}

export default function MealPlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { session } = useAuth();

  const [template, setTemplate] = useState<MealPlanTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pickerSlot, setPickerSlot] = useState<MealSlot | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSummary | null>(null);
  const [servingsInput, setServingsInput] = useState('1');
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getMealPlanTemplateDetail(id)
      .then(setTemplate)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this template.'))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase();
    if (!query) return recipes;
    return recipes.filter((recipe) => recipe.name.toLowerCase().includes(query));
  }, [recipes, recipeSearch]);

  const openPicker = (slot: MealSlot) => {
    setPickerSlot(slot);
    setRecipeSearch('');
    setSelectedRecipe(null);
    setServingsInput('1');
    setItemError(null);
    if (session) {
      setLoadingRecipes(true);
      listRecipes(session.user.id)
        .then(setRecipes)
        .catch((err) => setItemError(err instanceof Error ? err.message : 'Failed to load your recipes.'))
        .finally(() => setLoadingRecipes(false));
    }
  };

  const closePicker = () => setPickerSlot(null);

  const parsedServings = Number(servingsInput);
  const hasValidServings = servingsInput.trim().length > 0 && !Number.isNaN(parsedServings) && parsedServings > 0;

  const handleAddItem = async () => {
    setItemError(null);
    if (!template || !pickerSlot || !selectedRecipe || !hasValidServings) return;

    setSavingItem(true);
    try {
      const existingInSlot = template.itemsBySlot[pickerSlot].length;
      await addMealPlanItem(
        template.id,
        { mealSlot: pickerSlot, recipeId: selectedRecipe.id, servings: parsedServings },
        existingInSlot
      );
      setPickerSlot(null);
      load();
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Something went wrong adding that recipe.');
    } finally {
      setSavingItem(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setRemovingId(itemId);
    try {
      await removeMealPlanItem(itemId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove that recipe.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!template) return;
    setDeleting(true);
    try {
      await deleteMealPlanTemplate(template.id);
      router.replace('/meal-plans');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete this template.');
      setDeleting(false);
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

          {!loading && template && (
            <>
              <View style={styles.titleRow}>
                <ThemedText type="title" style={styles.title}>
                  {template.name}
                </ThemedText>
                <Pressable onPress={() => router.push(`/meal-plans/edit/${template.id}`)}>
                  <ThemedText type="linkPrimary">Edit</ThemedText>
                </Pressable>
              </View>
              <ThemedText themeColor="textSecondary" style={styles.meta}>
                {goalLabel(template.goalType)} · {template.itemCount} recipe{template.itemCount === 1 ? '' : 's'}
              </ThemedText>

              <ThemedView type="backgroundElement" style={styles.totalsCard}>
                <ThemedText type="smallBold">Baseline (calculated from recipes below)</ThemedText>
                {template.itemCount === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Add recipes to each meal slot to see this.
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="smallBold" style={styles.totalsHero}>
                      {Math.round(template.totalCalories)} kcal / day
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {round(template.totalProtein)}g protein · {round(template.totalCarbs)}g carbs ·{' '}
                      {round(template.totalFat)}g fat
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.totalsHint}>
                      Actual split: {template.actualProteinPercent}/{template.actualCarbPercent}/
                      {template.actualFatPercent} · Target: {template.targetProteinPercent}/
                      {template.targetCarbPercent}/{template.targetFatPercent}
                      {template.actualProteinPercent === template.targetProteinPercent &&
                      template.actualCarbPercent === template.targetCarbPercent &&
                      template.actualFatPercent === template.targetFatPercent
                        ? ' -- on target'
                        : ' -- adjust recipes to close the gap; scaling to a client preserves this same ratio'}
                    </ThemedText>
                  </>
                )}
              </ThemedView>

              {MEAL_SLOTS.map(({ key, label }) => {
                const items = template.itemsBySlot[key];
                const slotCalories = items.reduce((sum, item) => sum + item.caloriesPerServing * item.servings, 0);
                return (
                  <View key={key} style={styles.slotSection}>
                    <View style={styles.slotHeaderRow}>
                      <ThemedText type="smallBold">
                        {label}
                        {items.length > 0 ? ` · ${Math.round(slotCalories)} kcal` : ''}
                      </ThemedText>
                      <Pressable onPress={() => openPicker(key)}>
                        <ThemedText type="linkPrimary">+ Add recipe</ThemedText>
                      </Pressable>
                    </View>

                    {items.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Nothing yet.
                      </ThemedText>
                    ) : (
                      items.map((item) => (
                        <ThemedView key={item.id} type="backgroundElement" style={styles.itemRow}>
                          <View style={styles.itemInfo}>
                            <ThemedText type="small">
                              {item.recipeName} × {round(item.servings)}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {Math.round(item.caloriesPerServing * item.servings)} cal ·{' '}
                              {round(item.proteinPerServing * item.servings)}g protein ·{' '}
                              {round(item.carbsPerServing * item.servings)}g carbs ·{' '}
                              {round(item.fatPerServing * item.servings)}g fat
                            </ThemedText>
                          </View>
                          <Pressable onPress={() => handleRemoveItem(item.id)} disabled={removingId === item.id}>
                            {removingId === item.id ? (
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
                  </View>
                );
              })}

              <Pressable
                style={({ pressed }) => [styles.assignButton, pressed && styles.pressed]}
                onPress={() => router.push(`/meal-plans/assign/${template.id}`)}>
                <ThemedText type="smallBold" style={styles.assignButtonText}>
                  Assign to a client
                </ThemedText>
              </Pressable>

              <Pressable style={styles.deleteTemplateButton} onPress={() => setDeleteConfirmVisible(true)}>
                <ThemedText type="small" style={styles.removeText}>
                  Delete this template
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={pickerSlot !== null} transparent animationType="fade" onRequestClose={closePicker}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Add recipe to {MEAL_SLOTS.find((s) => s.key === pickerSlot)?.label}
            </ThemedText>

            {!selectedRecipe ? (
              <>
                <TextInput
                  value={recipeSearch}
                  onChangeText={setRecipeSearch}
                  placeholder="Search your recipes"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />

                {loadingRecipes && <ActivityIndicator style={styles.smallLoader} />}
                {!loadingRecipes && filteredRecipes.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.noResults}>
                    {recipes.length === 0
                      ? 'No recipes in your library yet -- build one in Recipe Builder first.'
                      : 'No matches.'}
                  </ThemedText>
                )}

                <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                  {filteredRecipes.map((recipe) => (
                    <Pressable key={recipe.id} onPress={() => setSelectedRecipe(recipe)}>
                      <View style={styles.resultRow}>
                        <ThemedText type="small" style={styles.resultName}>
                          {recipe.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {Math.round(recipe.caloriesPerServing)} cal/serving · {recipe.servings} servings
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <ThemedText type="smallBold">{selectedRecipe.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {Math.round(selectedRecipe.caloriesPerServing)} cal/serving · {round(selectedRecipe.proteinPerServing)}
                  g protein · {round(selectedRecipe.carbsPerServing)}g carbs · {round(selectedRecipe.fatPerServing)}g fat
                </ThemedText>

                <ThemedText type="smallBold" style={styles.sectionLabel}>
                  Servings for this slot
                </ThemedText>
                <TextInput
                  value={servingsInput}
                  onChangeText={setServingsInput}
                  keyboardType="decimal-pad"
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />

                {hasValidServings ? (
                  <ThemedText type="smallBold">
                    Contributes {Math.round(selectedRecipe.caloriesPerServing * parsedServings)} cal to this slot
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.error}>Enter a valid number of servings.</ThemedText>
                )}

                <Pressable onPress={() => setSelectedRecipe(null)}>
                  <ThemedText type="linkPrimary">← Search again</ThemedText>
                </Pressable>
              </>
            )}

            {itemError && <ThemedText style={styles.error}>{itemError}</ThemedText>}

            {selectedRecipe && (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={handleAddItem}
                disabled={savingItem || !hasValidServings}>
                {savingItem ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <ThemedText type="smallBold" style={styles.primaryButtonText}>
                    Add to plan
                  </ThemedText>
                )}
              </Pressable>
            )}

            <Pressable style={styles.cancelButton} onPress={closePicker}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={deleteConfirmVisible}
        title="Delete this template?"
        message={template ? `"${template.name}" will be permanently removed.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmVisible(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: { paddingBottom: Spacing.four },
  backButton: { marginBottom: Spacing.two },
  loader: { marginTop: Spacing.five },
  smallLoader: { marginVertical: Spacing.one },
  error: { color: Accent, textAlign: 'center' },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 28, lineHeight: 34 },
  meta: { marginTop: Spacing.half },
  totalsCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.three,
    gap: Spacing.half,
  },
  totalsHero: { fontSize: 22 },
  totalsHint: { marginTop: Spacing.one },
  slotSection: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  slotHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  itemInfo: { flex: 1, gap: Spacing.half },
  removeText: { color: Colors.textSecondary },
  assignButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.five,
  },
  pressed: { opacity: 0.85 },
  assignButtonText: { color: Colors.text },
  deleteTemplateButton: {
    alignItems: 'center',
    marginTop: Spacing.three,
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
  modalTitle: { marginBottom: Spacing.two },
  sectionLabel: { marginTop: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  noResults: { textAlign: 'center', marginVertical: Spacing.two },
  resultsList: { maxHeight: 280 },
  resultRow: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
    gap: Spacing.half,
  },
  resultName: { fontWeight: '700' },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  primaryButtonText: { color: Colors.text },
  cancelButton: { alignItems: 'center', paddingVertical: Spacing.two },
});
