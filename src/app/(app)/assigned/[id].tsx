import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getAssignmentDetail, logWorkout, type AssignmentDetail } from '@/lib/assignments';

type ExerciseInput = {
  weight: string;
  reps: string;
};

function buildInputsFromDetail(detail: AssignmentDetail): Record<string, ExerciseInput> {
  const inputs: Record<string, ExerciseInput> = {};
  detail.exercises.forEach((exercise) => {
    inputs[exercise.id] = {
      weight: exercise.loggedWeight !== null ? String(exercise.loggedWeight) : '',
      reps: exercise.loggedReps !== null ? String(exercise.loggedReps) : '',
    };
  });
  return inputs;
}

export default function AssignedWorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { session } = useAuth();

  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [inputs, setInputs] = useState<Record<string, ExerciseInput>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getAssignmentDetail(id)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setInputs(buildInputsFromDetail(data));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this workout.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const updateInput = (exerciseId: string, field: keyof ExerciseInput, value: string) => {
    setInputs((current) => ({
      ...current,
      [exerciseId]: { ...current[exerciseId], [field]: value },
    }));
  };

  const handleMarkComplete = async () => {
    setSaveError(null);
    if (!session || !detail) return;

    const entries = detail.exercises.map((exercise) => {
      const input = inputs[exercise.id] ?? { weight: '', reps: '' };
      const weight = input.weight.trim() === '' ? null : Number(input.weight);
      const reps = input.reps.trim() === '' ? null : Number(input.reps);
      return { exerciseId: exercise.id, weight, reps };
    });

    const hasInvalidNumber = entries.some(
      (entry) =>
        (entry.weight !== null && Number.isNaN(entry.weight)) || (entry.reps !== null && Number.isNaN(entry.reps))
    );
    if (hasInvalidNumber) {
      setSaveError('Weight and reps must be numbers.');
      return;
    }

    setSaving(true);
    try {
      await logWorkout(session.user.id, detail.id, entries);
      const refreshed = await getAssignmentDetail(detail.id);
      setDetail(refreshed);
      setInputs(buildInputsFromDetail(refreshed));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong saving your log.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="linkPrimary">Back</ThemedText>
          </Pressable>

          {loading && <ActivityIndicator style={styles.loader} />}

          {!loading && error && <ThemedText style={styles.error}>{error}</ThemedText>}

          {!loading && detail && (
            <>
              <ThemedText type="title" style={styles.title}>
                {detail.workoutName}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.date}>
                {detail.assignedDate} ·{' '}
                <ThemedText
                  type="smallBold"
                  themeColor={detail.status === 'completed' ? undefined : 'textSecondary'}
                  style={detail.status === 'completed' ? styles.statusCompleted : undefined}>
                  {detail.status === 'completed' ? 'Completed' : 'Pending'}
                </ThemedText>
              </ThemedText>

              {detail.exercises.length === 0 && (
                <ThemedText themeColor="textSecondary">This workout has no exercises.</ThemedText>
              )}

              {detail.exercises.map((exercise, index) => {
                const input = inputs[exercise.id] ?? { weight: '', reps: '' };
                return (
                  <ThemedView key={exercise.id} type="backgroundElement" style={styles.exerciseCard}>
                    <View style={styles.exerciseHeader}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {index + 1}
                      </ThemedText>
                      <View style={styles.exerciseText}>
                        <ThemedText type="smallBold">{exercise.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Target: {exercise.setsReps}
                        </ThemedText>
                      </View>
                    </View>

                    {detail.status === 'completed' ? (
                      <ThemedText type="small">
                        Logged: {exercise.loggedWeight ?? '—'} weight · {exercise.loggedReps ?? '—'} reps
                      </ThemedText>
                    ) : (
                      <View style={styles.inputsRow}>
                        <TextInput
                          value={input.weight}
                          onChangeText={(value) => updateInput(exercise.id, 'weight', value)}
                          placeholder="Weight"
                          placeholderTextColor={theme.textSecondary}
                          keyboardType="numeric"
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        />
                        <TextInput
                          value={input.reps}
                          onChangeText={(value) => updateInput(exercise.id, 'reps', value)}
                          placeholder="Reps"
                          placeholderTextColor={theme.textSecondary}
                          keyboardType="numeric"
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        />
                      </View>
                    )}
                  </ThemedView>
                );
              })}

              {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}

              {detail.status === 'pending' && (
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                  onPress={handleMarkComplete}
                  disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color={Colors.text} />
                  ) : (
                    <ThemedText type="smallBold" style={styles.primaryButtonText}>
                      Mark Complete
                    </ThemedText>
                  )}
                </Pressable>
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
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  backButton: {
    marginBottom: Spacing.two,
  },
  title: {
    marginTop: Spacing.two,
  },
  date: {
    marginBottom: Spacing.two,
  },
  statusCompleted: {
    color: Colors.tealBright,
  },
  loader: {
    marginTop: Spacing.five,
  },
  error: {
    color: Accent,
    textAlign: 'center',
  },
  exerciseCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exerciseText: {
    flex: 1,
    gap: Spacing.half,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  primaryButton: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.text,
  },
});
