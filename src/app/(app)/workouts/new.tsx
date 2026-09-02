import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { listExerciseLibrarySummaries, type ExerciseSummary } from '@/lib/exercise-library';
import { getProgrammeWeekContext, type ProgrammeWeekContext } from '@/lib/programmes';
import { createWorkout } from '@/lib/workouts';

const MAX_SUGGESTIONS = 8;

type ExerciseRow = {
  key: string;
  exerciseLibraryId: string | null;
  exerciseName: string;
  muscleGroup: string | null;
  setsReps: string;
  searchQuery: string;
};

let nextKey = 0;
function makeExerciseRow(): ExerciseRow {
  nextKey += 1;
  return { key: `exercise-${nextKey}`, exerciseLibraryId: null, exerciseName: '', muscleGroup: null, setsReps: '', searchQuery: '' };
}

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export default function NewWorkoutScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const { weekId } = useLocalSearchParams<{ weekId?: string }>();
  const [workoutName, setWorkoutName] = useState('');
  const [exercises, setExercises] = useState<ExerciseRow[]>([makeExerciseRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekContext, setWeekContext] = useState<ProgrammeWeekContext | null>(null);

  const [libraryExercises, setLibraryExercises] = useState<ExerciseSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // Only fetched when this screen is opened from a programme week, to show
  // "Week N of <programme>" instead of a bare id — purely informational,
  // doesn't affect saving.
  useEffect(() => {
    if (!weekId) return;
    let cancelled = false;
    getProgrammeWeekContext(weekId)
      .then((context) => {
        if (!cancelled) setWeekContext(context);
      })
      .catch((err) => console.error('Failed to load week context:', err));
    return () => {
      cancelled = true;
    };
  }, [weekId]);

  // The exercise picker's search runs entirely against this one fetch —
  // ~870 lightweight rows, fetched once, filtered per-row in memory.
  // Every exercise added to a workout now has to be a real library
  // entry, so this has to succeed before a coach can save anything.
  useEffect(() => {
    let cancelled = false;
    listExerciseLibrarySummaries()
      .then((data) => {
        if (!cancelled) setLibraryExercises(data);
      })
      .catch((err) => {
        if (!cancelled) setLibraryError(err instanceof Error ? err.message : 'Failed to load the exercise library.');
      })
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (key: string, patch: Partial<ExerciseRow>) => {
    setExercises((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const selectExercise = (key: string, exercise: ExerciseSummary) => {
    updateRow(key, {
      exerciseLibraryId: exercise.id,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup,
      searchQuery: '',
    });
  };

  const clearSelection = (key: string) => {
    updateRow(key, { exerciseLibraryId: null, exerciseName: '', muscleGroup: null, searchQuery: '' });
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
      .filter((row) => row.exerciseLibraryId !== null)
      .map((row) => ({
        exerciseLibraryId: row.exerciseLibraryId as string,
        name: row.exerciseName,
        setsReps: row.setsReps.trim(),
      }));

    if (cleaned.length === 0) {
      setError('Add at least one exercise from the library.');
      return;
    }

    setSaving(true);
    try {
      await createWorkout(session.user.id, name, cleaned, weekId);
      if (weekId) {
        router.replace(`/programmes/week/${weekId}`);
      } else {
        router.replace('/workouts');
      }
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
            {weekId ? 'New session' : 'New workout'}
          </ThemedText>
          {weekId && weekContext && (
            <ThemedText themeColor="textSecondary" style={styles.weekContext}>
              Week {weekContext.weekNumber} · {weekContext.programmeName}
            </ThemedText>
          )}

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

          {libraryLoading && <ActivityIndicator style={styles.libraryLoader} />}
          {!libraryLoading && libraryError && <ThemedText style={styles.error}>{libraryError}</ThemedText>}

          {!libraryLoading &&
            !libraryError &&
            exercises.map((row, index) => (
              <ExerciseRowInput
                key={row.key}
                row={row}
                index={index}
                theme={theme}
                libraryExercises={libraryExercises}
                canRemove={exercises.length > 1}
                onSelect={(exercise) => selectExercise(row.key, exercise)}
                onClear={() => clearSelection(row.key)}
                onSearchChange={(value) => updateRow(row.key, { searchQuery: value })}
                onSetsRepsChange={(value) => updateRow(row.key, { setsReps: value })}
                onRemove={() => removeExercise(row.key)}
              />
            ))}

          {!libraryLoading && !libraryError && (
            <Pressable style={styles.addButton} onPress={addExercise}>
              <ThemedText type="linkPrimary">+ Add exercise</ThemedText>
            </Pressable>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleSave}
            disabled={saving || libraryLoading}>
            {saving ? (
              <ActivityIndicator color={Colors.text} />
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

function ExerciseRowInput({
  row,
  index,
  theme,
  libraryExercises,
  canRemove,
  onSelect,
  onClear,
  onSearchChange,
  onSetsRepsChange,
  onRemove,
}: {
  row: ExerciseRow;
  index: number;
  theme: ReturnType<typeof useTheme>;
  libraryExercises: ExerciseSummary[];
  canRemove: boolean;
  onSelect: (exercise: ExerciseSummary) => void;
  onClear: () => void;
  onSearchChange: (value: string) => void;
  onSetsRepsChange: (value: string) => void;
  onRemove: () => void;
}) {
  const suggestions = useMemo(() => {
    const query = row.searchQuery.trim().toLowerCase();
    if (!query) return [];
    return libraryExercises.filter((exercise) => exercise.name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
  }, [row.searchQuery, libraryExercises]);

  return (
    <ThemedView type="backgroundElement" style={styles.exerciseRow}>
      <View style={styles.exerciseRowTop}>
        <ThemedText type="small" themeColor="textSecondary">
          {index + 1}
        </ThemedText>
        <View style={styles.exerciseInputs}>
          {row.exerciseLibraryId ? (
            <View style={styles.selectedExercise}>
              <View style={styles.selectedExerciseText}>
                <ThemedText type="smallBold">{row.exerciseName}</ThemedText>
                {row.muscleGroup && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {titleCase(row.muscleGroup)}
                  </ThemedText>
                )}
              </View>
              <Pressable onPress={onClear} hitSlop={8}>
                <ThemedText type="linkPrimary">Change</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                value={row.searchQuery}
                onChangeText={onSearchChange}
                placeholder="Search the exercise library"
                placeholderTextColor={theme.textSecondary}
                style={[styles.exerciseInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
              {suggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {suggestions.map((exercise) => (
                    <Pressable key={exercise.id} onPress={() => onSelect(exercise)} style={styles.suggestionRow}>
                      <ThemedText type="small">{exercise.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {titleCase(exercise.muscleGroup)}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
              {row.searchQuery.trim().length > 0 && suggestions.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No matches in the exercise library.
                </ThemedText>
              )}
            </>
          )}

          <TextInput
            value={row.setsReps}
            onChangeText={onSetsRepsChange}
            placeholder="Sets x reps (e.g. 3x10)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.exerciseInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
        </View>
        {canRemove && (
          <Pressable onPress={onRemove} hitSlop={8}>
            <ThemedText style={styles.removeText}>Remove</ThemedText>
          </Pressable>
        )}
      </View>
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
    marginBottom: Spacing.half,
  },
  weekContext: {
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
  libraryLoader: {
    marginTop: Spacing.two,
  },
  exerciseRow: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  exerciseRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  selectedExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Accent,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  selectedExerciseText: {
    flex: 1,
    gap: Spacing.half,
  },
  suggestionsBox: {
    borderWidth: 1,
    borderColor: Colors.backgroundSelected,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundSelected,
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
    ...Glow.oxblood,
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
    color: Colors.text,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
