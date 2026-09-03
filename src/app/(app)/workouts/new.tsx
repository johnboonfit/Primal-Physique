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
import { SET_TYPES, type SetType } from '@/lib/set-types';
import { createWorkout, type ExerciseDraft } from '@/lib/workouts';

const MAX_SUGGESTIONS = 8;

type SetRow = {
  key: string;
  setNumber: number;
  setType: SetType;
};

type ExerciseRow = {
  key: string;
  exerciseLibraryId: string | null;
  exerciseName: string;
  muscleGroup: string | null;
  setsReps: string;
  searchQuery: string;
  baselineWeight: string;
  baselineReps: string;
  taggedSets: SetRow[];
};

let nextKey = 0;
function makeExerciseRow(): ExerciseRow {
  nextKey += 1;
  return {
    key: `exercise-${nextKey}`,
    exerciseLibraryId: null,
    exerciseName: '',
    muscleGroup: null,
    setsReps: '',
    searchQuery: '',
    baselineWeight: '',
    baselineReps: '',
    taggedSets: [],
  };
}

let nextSetKey = 0;
function makeSetRow(setNumber: number): SetRow {
  nextSetKey += 1;
  return { key: `set-${nextSetKey}`, setNumber, setType: 'normal' };
}

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Validates and converts one form row into what createWorkout() actually
 * saves. Returns an error message (string) instead of throwing, so the
 * caller can point out which exercise the problem is in. */
function buildExerciseDraft(row: ExerciseRow): ExerciseDraft | string {
  const trimmedWeight = row.baselineWeight.trim();
  const trimmedReps = row.baselineReps.trim();

  let baselineWeight: number | null = null;
  if (trimmedWeight) {
    const parsed = Number(trimmedWeight);
    if (Number.isNaN(parsed) || parsed < 0) return 'Baseline weight must be a number of 0 or more.';
    baselineWeight = parsed;
  }

  let baselineReps: number | null = null;
  if (trimmedReps) {
    const parsed = Number(trimmedReps);
    if (!Number.isInteger(parsed) || parsed <= 0) return 'Baseline reps must be a whole number greater than 0.';
    baselineReps = parsed;
  }

  return {
    exerciseLibraryId: row.exerciseLibraryId as string,
    name: row.exerciseName,
    setsReps: row.setsReps.trim(),
    baselineWeight,
    baselineReps,
    sets: row.taggedSets.map((set) => ({ setNumber: set.setNumber, setType: set.setType })),
  };
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

  const addTaggedSet = (exerciseKey: string) => {
    setExercises((current) =>
      current.map((row) =>
        row.key === exerciseKey ? { ...row, taggedSets: [...row.taggedSets, makeSetRow(row.taggedSets.length + 1)] } : row
      )
    );
  };

  const removeTaggedSet = (exerciseKey: string, setKey: string) => {
    setExercises((current) =>
      current.map((row) =>
        row.key === exerciseKey
          ? {
              ...row,
              // Renumber the rest so set numbers stay contiguous (1, 2,
              // 3...) after removing one from the middle.
              taggedSets: row.taggedSets
                .filter((set) => set.key !== setKey)
                .map((set, index) => ({ ...set, setNumber: index + 1 })),
            }
          : row
      )
    );
  };

  const setTaggedSetType = (exerciseKey: string, setKey: string, setType: SetType) => {
    setExercises((current) =>
      current.map((row) =>
        row.key === exerciseKey
          ? { ...row, taggedSets: row.taggedSets.map((set) => (set.key === setKey ? { ...set, setType } : set)) }
          : row
      )
    );
  };

  const handleSave = async () => {
    setError(null);
    if (!session) return;

    const name = workoutName.trim();
    if (!name) {
      setError('Give the workout a name.');
      return;
    }

    const activeRows = exercises.filter((row) => row.exerciseLibraryId !== null);

    if (activeRows.length === 0) {
      setError('Add at least one exercise from the library.');
      return;
    }

    const cleaned: ExerciseDraft[] = [];
    for (const row of activeRows) {
      const draft = buildExerciseDraft(row);
      if (typeof draft === 'string') {
        setError(`${row.exerciseName || 'An exercise'}: ${draft}`);
        return;
      }
      cleaned.push(draft);
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
                onBaselineWeightChange={(value) => updateRow(row.key, { baselineWeight: value })}
                onBaselineRepsChange={(value) => updateRow(row.key, { baselineReps: value })}
                onAddSet={() => addTaggedSet(row.key)}
                onRemoveSet={(setKey) => removeTaggedSet(row.key, setKey)}
                onSetTypeChange={(setKey, setType) => setTaggedSetType(row.key, setKey, setType)}
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
  onBaselineWeightChange,
  onBaselineRepsChange,
  onAddSet,
  onRemoveSet,
  onSetTypeChange,
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
  onBaselineWeightChange: (value: string) => void;
  onBaselineRepsChange: (value: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setKey: string) => void;
  onSetTypeChange: (setKey: string, setType: SetType) => void;
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

          <View style={styles.baselineRow}>
            <TextInput
              value={row.baselineWeight}
              onChangeText={onBaselineWeightChange}
              placeholder="Baseline weight (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              testID={`exercise-${index}-baseline-weight`}
              style={[styles.exerciseInput, styles.baselineInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              value={row.baselineReps}
              onChangeText={onBaselineRepsChange}
              placeholder="Baseline reps (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              testID={`exercise-${index}-baseline-reps`}
              style={[styles.exerciseInput, styles.baselineInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Used as a fallback for a client with no previous session logged for this exercise.
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.taggedSetsLabel}>
            Set types (optional -- tag individual sets, e.g. "set 3 is a drop set")
          </ThemedText>
          {row.taggedSets.map((set, setIndex) => (
            <View key={set.key} style={styles.setRow} testID={`exercise-${index}-set-${setIndex}`}>
              <ThemedText type="small" style={styles.setNumber} testID={`exercise-${index}-set-${setIndex}-number`}>
                Set {set.setNumber}
              </ThemedText>
              <View style={styles.setTypeChips}>
                {SET_TYPES.map(({ key: typeKey, label }) => {
                  const selected = set.setType === typeKey;
                  return (
                    <Pressable
                      key={typeKey}
                      onPress={() => onSetTypeChange(set.key, typeKey)}
                      testID={`exercise-${index}-set-${setIndex}-type-${typeKey}`}
                      style={[styles.setTypeChip, { borderColor: theme.backgroundSelected }, selected && styles.setTypeChipSelected]}>
                      <ThemedText type="small" style={selected ? styles.setTypeChipTextSelected : undefined}>
                        {label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => onRemoveSet(set.key)} hitSlop={8} testID={`exercise-${index}-set-${setIndex}-remove`}>
                <ThemedText style={styles.removeText}>Remove</ThemedText>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={onAddSet} style={styles.addSetButton} testID={`exercise-${index}-add-set`}>
            <ThemedText type="small" style={styles.addSetText}>
              + Tag a set
            </ThemedText>
          </Pressable>
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
  baselineRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  baselineInput: {
    flex: 1,
  },
  taggedSetsLabel: {
    marginTop: Spacing.one,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  setNumber: {
    width: 44,
  },
  setTypeChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  setTypeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  setTypeChipSelected: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  setTypeChipTextSelected: {
    color: Colors.text,
    fontWeight: '700',
  },
  addSetButton: {
    alignSelf: 'flex-start',
  },
  addSetText: {
    color: Accent,
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
