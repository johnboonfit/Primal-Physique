import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getErrorMessage } from '@/lib/errors';
import type { Meal } from '@/lib/food-logs';
import { deleteSavedMeal, listSavedMeals, logSavedMeal, type SavedMeal } from '@/lib/saved-meals';

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function SavedMealsScreen() {
  const { session } = useAuth();

  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loggingKey, setLoggingKey] = useState<string | null>(null);
  const [loggedConfirmation, setLoggedConfirmation] = useState<{ mealId: string; slotLabel: string } | null>(null);
  const confirmationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listSavedMeals(session.user.id)
      .then(setMeals)
      .catch((err) => setError(getErrorMessage(err, 'Failed to load your saved meals.')))
      .finally(() => setLoading(false));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleLogToSlot = async (meal: SavedMeal, slot: Meal, slotLabel: string) => {
    if (!session) return;
    setActionError(null);
    const key = `${meal.id}:${slot}`;
    setLoggingKey(key);
    try {
      await logSavedMeal(session.user.id, todayISODate(), slot, meal);
      if (confirmationTimeout.current) clearTimeout(confirmationTimeout.current);
      setLoggedConfirmation({ mealId: meal.id, slotLabel });
      confirmationTimeout.current = setTimeout(() => setLoggedConfirmation(null), 3000);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to log that meal.'));
    } finally {
      setLoggingKey(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    setActionError(null);
    try {
      await deleteSavedMeal(confirmDeleteId);
      setMeals((current) => current.filter((m) => m.id !== confirmDeleteId));
      setConfirmDeleteId(null);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to delete that saved meal.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          <ThemedText type="title" style={styles.title}>
            Saved Meals
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Log a whole meal's worth of food in one tap -- no re-searching.
          </ThemedText>

          {loading && <ActivityIndicator style={styles.loader} />}
          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}
          {!loading && !error && actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

          {!loading && !error && meals.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No saved meals yet -- log some food under any meal on the Nutrition tab, then tap "Save as meal" to
              create one.
            </ThemedText>
          )}

          {!loading &&
            !error &&
            meals.map((meal) => {
              const totalCalories = meal.items.reduce((sum, item) => sum + item.calories, 0);
              const itemNames = meal.items.map((item) => item.foodName).join(', ');
              const justLogged = loggedConfirmation?.mealId === meal.id;

              return (
                <ThemedView key={meal.id} type="backgroundElement" style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderText}>
                      <ThemedText type="smallBold">{meal.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {meal.items.length} item{meal.items.length === 1 ? '' : 's'} · {Math.round(totalCalories)} kcal
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => setConfirmDeleteId(meal.id)}
                      hitSlop={8}
                      accessibilityLabel={`Delete ${meal.name}`}>
                      <Ionicons name="trash-outline" size={18} color={Accent} />
                    </Pressable>
                  </View>

                  {itemNames.length > 0 && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.itemNames}>
                      {itemNames}
                    </ThemedText>
                  )}

                  <View style={styles.slotRow}>
                    {MEALS.map((slot) => {
                      const key = `${meal.id}:${slot.key}`;
                      return (
                        <Pressable
                          key={slot.key}
                          onPress={() => handleLogToSlot(meal, slot.key, slot.label)}
                          disabled={loggingKey === key}
                          style={styles.slotChip}>
                          {loggingKey === key ? (
                            <ActivityIndicator size="small" />
                          ) : (
                            <ThemedText type="small" style={styles.slotChipText}>
                              Log to {slot.label}
                            </ThemedText>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>

                  {justLogged && (
                    <ThemedText type="small" style={styles.loggedText}>
                      ✓ Logged to {loggedConfirmation?.slotLabel} today
                    </ThemedText>
                  )}
                </ThemedView>
              );
            })}
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmDeleteId !== null}
        title="Delete this saved meal?"
        message="This only removes the template -- anything you've already logged from it stays exactly as it is."
        confirmLabel="Delete"
        busy={deletingId !== null}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
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
  backButton: {
    marginBottom: Spacing.two,
  },
  title: {
    marginBottom: Spacing.half,
  },
  subtitle: {
    marginBottom: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: Spacing.three,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  cardHeaderText: {
    flex: 1,
    gap: Spacing.half,
  },
  itemNames: {
    marginTop: -Spacing.one,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  slotChip: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  slotChipText: {
    color: Colors.tealBright,
  },
  loggedText: {
    color: Colors.tealBright,
  },
});
