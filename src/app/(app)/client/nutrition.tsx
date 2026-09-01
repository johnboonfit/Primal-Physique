import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroStat } from '@/components/hero-stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { addFoodLog, listFoodLogsForDate, type FoodLogEntry, type Meal } from '@/lib/food-logs';

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function todayDisplayDate() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function NutritionScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const logDate = todayISODate();

  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeMeal, setActiveMeal] = useState<Meal | null>(null);
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);

  const openAddEntry = (meal: Meal) => {
    setActiveMeal(meal);
    setFoodName('');
    setCalories('');
    setFormError(null);
  };

  const closeModal = () => setActiveMeal(null);

  const handleSave = async () => {
    setFormError(null);
    if (!session || !activeMeal) return;

    const trimmedName = foodName.trim();
    if (!trimmedName) {
      setFormError('Enter a food name.');
      return;
    }
    const parsedCalories = Number(calories);
    if (!calories.trim() || Number.isNaN(parsedCalories) || parsedCalories < 0) {
      setFormError('Enter calories as a number.');
      return;
    }

    setSaving(true);
    try {
      await addFoodLog(session.user.id, logDate, activeMeal, trimmedName, Math.round(parsedCalories));
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
                          {entry.calories} cal
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

            <TextInput
              value={foodName}
              onChangeText={setFoodName}
              placeholder="Food name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={calories}
              onChangeText={setCalories}
              placeholder="Calories"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />

            {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={handleSave}
              disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  Save
                </ThemedText>
              )}
            </Pressable>

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
    maxWidth: 360,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalTitle: {
    marginBottom: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
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
