import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { createWorkout } from '@/lib/workouts';

type ExerciseRow = {
  key: string;
  name: string;
  setsReps: string;
};

let nextKey = 0;
function makeExerciseRow(): ExerciseRow {
  nextKey += 1;
  return { key: `exercise-${nextKey}`, name: '', setsReps: '' };
}

export default function NewWorkoutScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const [workoutName, setWorkoutName] = useState('');
  const [exercises, setExercises] = useState<ExerciseRow[]>([makeExerciseRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateExercise = (key: string, field: 'name' | 'setsReps', value: string) => {
    setExercises((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const addExercise = () => setExercises((current) => [...current, makeExerciseRow()]);

  const removeExercise = (key: string) => {
    setExercises((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  };

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    const name = workoutName.trim();
    if (!name) {
      setError('Give the workout a name.');
      return;
    }

    const cleaned = exercises
      .map((row) => ({ name: row.name.trim(), setsReps: row.setsReps.trim() }))
      .filter((row) => row.name.length > 0);

    if (cleaned.length === 0) {
      setError('Add at least one exercise.');
      return;
    }

    setSaving(true);
    try {
      await createWorkout(session.user.id, name, cleaned);
      router.replace('/workouts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the workout.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            New workout
          </ThemedText>

          <TextInput
            value={workoutName}
            onChangeText={setWorkoutName}
            placeholder="Workout name (e.g. Push Day)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold" style={styles.sectionLabel}>
            Exercises
          </ThemedText>

          {exercises.map((row, index) => (
            <ThemedView key={row.key} type="backgroundElement" style={styles.exerciseRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {index + 1}
              </ThemedText>
              <View style={styles.exerciseInputs}>
                <TextInput
                  value={row.name}
                  onChangeText={(value) => updateExercise(row.key, 'name', value)}
                  placeholder="Exercise name"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.exerciseInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
                <TextInput
                  value={row.setsReps}
                  onChangeText={(value) => updateExercise(row.key, 'setsReps', value)}
                  placeholder="Sets x reps (e.g. 3x10)"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.exerciseInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
              </View>
              {exercises.length > 1 && (
                <Pressable onPress={() => removeExercise(row.key)} hitSlop={8}>
                  <ThemedText style={styles.removeText}>Remove</ThemedText>
                </Pressable>
              )}
            </ThemedView>
          ))}

          <Pressable style={styles.addButton} onPress={addExercise}>
            <ThemedText type="linkPrimary">+ Add exercise</ThemedText>
          </Pressable>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                Save workout
              </ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText themeColor="textSecondary">Cancel</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  exerciseInputs: {
    flex: 1,
    gap: Spacing.two,
  },
  exerciseInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  removeText: {
    color: Accent,
    fontSize: 12,
  },
  addButton: {
    alignSelf: 'flex-start',
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
