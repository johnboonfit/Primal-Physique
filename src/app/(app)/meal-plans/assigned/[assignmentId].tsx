import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { getScaledMealPlan, MEAL_SLOTS, type MealSlot, type ScaledMealPlanResult } from '@/lib/meal-plans';

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export default function AssignedMealPlanScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();

  const [result, setResult] = useState<ScaledMealPlanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!assignmentId) return;
    setLoading(true);
    getScaledMealPlan(assignmentId)
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this assigned meal plan.'))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const itemsBySlot = (slot: MealSlot) =>
    result?.hasCalorieTarget ? result.scaled.items.filter((item) => item.mealSlot === slot) : [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && result && (
            <>
              <ThemedText type="title" style={styles.title}>
                {result.templateName}
              </ThemedText>

              {!result.hasCalorieTarget && (
                <ThemedText themeColor="textSecondary" style={styles.noTarget}>
                  This client doesn't have a calorie target yet -- not enough weight/TDEE history logged. Nothing to
                  scale to until Adaptive TDEE has a real number for them.
                </ThemedText>
              )}

              {result.hasCalorieTarget && (
                <>
                  <ThemedView type="backgroundElement" style={styles.scaleCard}>
                    <ThemedText type="smallBold">Scaled to this client's real target</ThemedText>
                    <ThemedText type="smallBold" style={styles.scaleHero}>
                      {Math.round(result.scaled.totals.calories)} kcal
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Client's target: {Math.round(result.scaled.clientTargetCalories)} kcal · Template baseline:{' '}
                      {Math.round(result.scaled.baselineCalories)} kcal · Scale factor: ×{round(result.scaled.scaleFactor)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {round(result.scaled.totals.protein)}g protein · {round(result.scaled.totals.carbs)}g carbs ·{' '}
                      {round(result.scaled.totals.fat)}g fat
                    </ThemedText>
                  </ThemedView>

                  {MEAL_SLOTS.map(({ key, label }) => {
                    const items = itemsBySlot(key);
                    if (items.length === 0) return null;
                    return (
                      <View key={key} style={styles.slotSection}>
                        <ThemedText type="smallBold">{label}</ThemedText>
                        {items.map((item) => (
                          <ThemedView key={item.itemId} type="backgroundElement" style={styles.itemCard}>
                            <ThemedText type="small" style={styles.itemName}>
                              {item.recipeName}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {Math.round(item.calories)} cal · {round(item.protein)}g protein ·{' '}
                              {round(item.carbs)}g carbs · {round(item.fat)}g fat
                            </ThemedText>
                            {item.scaledIngredients.map((ingredient) => (
                              <ThemedText
                                key={ingredient.id}
                                type="small"
                                themeColor="textSecondary"
                                style={styles.ingredientLine}>
                                • {ingredient.name}: {round(ingredient.quantityGrams)}g
                              </ThemedText>
                            ))}
                          </ThemedView>
                        ))}
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  scrollContent: { paddingBottom: Spacing.four },
  backButton: { marginBottom: Spacing.two },
  loader: { marginTop: Spacing.five },
  error: { color: Accent, textAlign: 'center', marginTop: Spacing.five },
  title: { marginBottom: Spacing.two },
  noTarget: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  scaleCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
    marginBottom: Spacing.three,
  },
  scaleHero: { fontSize: 24 },
  slotSection: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  itemCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  itemName: { fontWeight: '700' },
  ingredientLine: {
    marginLeft: Spacing.two,
  },
});
