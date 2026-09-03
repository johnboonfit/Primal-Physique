import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/question-answer-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  getAssignmentDetail,
  getExercisePrefills,
  logWorkout,
  type AssignmentDetail,
  type ExercisePrefill,
} from '@/lib/assignments';
import { listExerciseLibrarySummaries, type ExerciseSummary } from '@/lib/exercise-library';
import {
  listExerciseSwapsForAssignment,
  swapExerciseForSession,
  undoExerciseSwap,
  type ExerciseSwap,
} from '@/lib/exercise-swaps';
import { getQuestionTypeDefinition, type AnswerValue } from '@/lib/question-types';
import { getReadinessStatusForAssignment, submitReadinessResponses, type ReadinessStatus } from '@/lib/readiness';
import { awardWorkoutXp } from '@/lib/xp';

/** What's actually shown/logged for one exercise slot right now -- the
 * swap's replacement if this session has one for it, otherwise exactly
 * what the workout/programme originally prescribed. The slot's own id
 * (and therefore where workout_logs attaches) never changes either way. */
function displayExercise(exercise: AssignmentDetail['exercises'][number], swap: ExerciseSwap | undefined) {
  if (!swap) return { ...exercise, isSwapped: false as const, originalName: exercise.name };
  return {
    ...exercise,
    name: swap.replacementName,
    exerciseLibraryId: swap.replacementExerciseLibraryId,
    isSwapped: true as const,
    originalName: exercise.name,
  };
}

/** A sensible starting value per answer kind for a not-yet-answered
 * readiness question -- same reasoning as checkins/[id].tsx's
 * blankAnswerFor: 0/blank would be a real (wrong) answer for a scale, so
 * that starts at null instead. */
function blankReadinessAnswer(question: ReadinessStatus['questions'][number]): AnswerValue {
  if (question.answer !== null) return question.answer as AnswerValue;
  const kind = getQuestionTypeDefinition(question.questionType).answerKind;
  if (kind === 'short_text' || kind === 'numeric') return '';
  if (kind === 'multi_choice') return [];
  return null;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

type ExerciseInput = {
  weight: string;
  reps: string;
};

/**
 * A resumed, already-logged exercise always shows exactly what the
 * client themselves entered -- the fallback chain (previous session /
 * coach baseline / nothing) only ever applies to an exercise THIS
 * assignment hasn't been logged for yet, which is the whole point: it's
 * a starting suggestion for a set that hasn't happened, not a
 * replacement for a real answer that already exists.
 */
function buildInputsFromDetail(
  detail: AssignmentDetail,
  prefills: Record<string, ExercisePrefill>
): Record<string, ExerciseInput> {
  const inputs: Record<string, ExerciseInput> = {};
  detail.exercises.forEach((exercise) => {
    if (exercise.loggedWeight !== null || exercise.loggedReps !== null) {
      inputs[exercise.id] = {
        weight: exercise.loggedWeight !== null ? String(exercise.loggedWeight) : '',
        reps: exercise.loggedReps !== null ? String(exercise.loggedReps) : '',
      };
      return;
    }

    const prefill = prefills[exercise.id];
    inputs[exercise.id] = {
      weight: prefill && prefill.weight !== null ? String(prefill.weight) : '',
      reps: prefill && prefill.reps !== null ? String(prefill.reps) : '',
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
  const [prefills, setPrefills] = useState<Record<string, ExercisePrefill>>({});
  const [swaps, setSwaps] = useState<Record<string, ExerciseSwap>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [readinessAnswers, setReadinessAnswers] = useState<Record<string, AnswerValue>>({});
  const [submittingReadiness, setSubmittingReadiness] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const [swapPickerExerciseId, setSwapPickerExerciseId] = useState<string | null>(null);
  const [libraryExercises, setLibraryExercises] = useState<ExerciseSummary[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [swapSearch, setSwapSearch] = useState('');
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  /** Re-derives prefills for every exercise using each one's EFFECTIVE
   * exercise (the swap's replacement where one exists) -- a swap counts
   * as "a new exercise for logging purposes," so its own previous-session
   * history applies, but the original exercise's coach baseline does
   * NOT (a baseline set for Bench Press is meaningless for whatever it
   * got swapped to). */
  const refreshPrefills = async (assignmentData: AssignmentDetail, swapMap: Record<string, ExerciseSwap>) => {
    if (!session) return {};
    const effectiveExercises = assignmentData.exercises.map((exercise) => {
      const swap = swapMap[exercise.id];
      return swap
        ? { id: exercise.id, exerciseLibraryId: swap.replacementExerciseLibraryId, baselineWeight: null, baselineReps: null }
        : { id: exercise.id, exerciseLibraryId: exercise.exerciseLibraryId, baselineWeight: exercise.baselineWeight, baselineReps: exercise.baselineReps };
    });
    return getExercisePrefills(session.user.id, assignmentData.id, effectiveExercises);
  };

  useEffect(() => {
    if (!id || !session) return;
    let cancelled = false;

    Promise.all([getAssignmentDetail(id), getReadinessStatusForAssignment(id), listExerciseSwapsForAssignment(id)])
      .then(async ([assignmentData, readinessData, swapMap]) => {
        if (cancelled) return;
        setDetail(assignmentData);
        setReadiness(readinessData);
        setSwaps(swapMap);
        const answers: Record<string, AnswerValue> = {};
        readinessData.questions.forEach((question) => {
          answers[question.id] = blankReadinessAnswer(question);
        });
        setReadinessAnswers(answers);

        const prefillMap = await refreshPrefills(assignmentData, swapMap);
        if (cancelled) return;
        setPrefills(prefillMap);
        setInputs(buildInputsFromDetail(assignmentData, prefillMap));
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
  }, [id, session]);

  const handleSubmitReadiness = async () => {
    setReadinessError(null);
    if (!session || !readiness) return;

    for (let i = 0; i < readiness.questions.length; i++) {
      const question = readiness.questions[i];
      const typeDefinition = getQuestionTypeDefinition(question.questionType);
      const validationError = typeDefinition.validateAnswer(question.config, readinessAnswers[question.id] ?? null);
      if (validationError) {
        setReadinessError(`Question ${i + 1}: ${validationError}`);
        return;
      }
    }

    setSubmittingReadiness(true);
    try {
      const responses = readiness.questions.map((question) => {
        const typeDefinition = getQuestionTypeDefinition(question.questionType);
        return {
          questionId: question.id,
          answer: typeDefinition.toStoredAnswer(question.config, readinessAnswers[question.id] ?? null),
        };
      });
      await submitReadinessResponses(id, session.user.id, responses);
      const refreshed = await getReadinessStatusForAssignment(id);
      setReadiness(refreshed);
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'Something went wrong submitting your answers.');
    } finally {
      setSubmittingReadiness(false);
    }
  };

  const updateInput = (exerciseId: string, field: keyof ExerciseInput, value: string) => {
    setInputs((current) => ({
      ...current,
      [exerciseId]: { ...current[exerciseId], [field]: value },
    }));
  };

  const openSwapPicker = (workoutExerciseId: string) => {
    setSwapPickerExerciseId(workoutExerciseId);
    setSwapSearch('');
    setSwapError(null);
    if (libraryExercises.length === 0 && !loadingLibrary) {
      setLoadingLibrary(true);
      listExerciseLibrarySummaries()
        .then(setLibraryExercises)
        .catch((err) => setLibraryError(err instanceof Error ? err.message : 'Failed to load the exercise library.'))
        .finally(() => setLoadingLibrary(false));
    }
  };

  const closeSwapPicker = () => setSwapPickerExerciseId(null);

  const handleSelectReplacement = async (workoutExerciseId: string, replacement: ExerciseSummary) => {
    setSwapError(null);
    if (!session || !detail) return;

    setSwappingId(workoutExerciseId);
    try {
      await swapExerciseForSession(detail.id, session.user.id, workoutExerciseId, {
        exerciseLibraryId: replacement.id,
        name: replacement.name,
      });
      const swapMap = await listExerciseSwapsForAssignment(detail.id);
      setSwaps(swapMap);
      // The swap is effectively a new exercise for logging purposes --
      // whatever was typed for the old one no longer applies, so its
      // fallback chain reruns fresh against the replacement.
      const prefillMap = await refreshPrefills(detail, swapMap);
      setPrefills(prefillMap);
      setInputs((current) => {
        const rebuilt = buildInputsFromDetail(detail, prefillMap);
        return { ...current, [workoutExerciseId]: rebuilt[workoutExerciseId] };
      });
      setSwapPickerExerciseId(null);
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : 'Something went wrong swapping this exercise.');
    } finally {
      setSwappingId(null);
    }
  };

  const handleUndoSwap = async (workoutExerciseId: string) => {
    if (!detail) return;
    setSwappingId(workoutExerciseId);
    try {
      await undoExerciseSwap(detail.id, workoutExerciseId);
      const swapMap = await listExerciseSwapsForAssignment(detail.id);
      setSwaps(swapMap);
      const prefillMap = await refreshPrefills(detail, swapMap);
      setPrefills(prefillMap);
      setInputs((current) => {
        const rebuilt = buildInputsFromDetail(detail, prefillMap);
        return { ...current, [workoutExerciseId]: rebuilt[workoutExerciseId] };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo that swap.');
    } finally {
      setSwappingId(null);
    }
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
      // XP is a bonus layer on top of completion, not a requirement for
      // it — if awarding XP hiccups, the workout still saved as
      // complete, so we don't want that to surface as an error here.
      try {
        await awardWorkoutXp(session.user.id, detail.id, todayISODate());
      } catch (xpErr) {
        console.error('Failed to award workout XP:', xpErr);
      }
      const refreshed = await getAssignmentDetail(detail.id);
      setDetail(refreshed);
      // Every exercise now has a real logged value, so the fallback
      // chain no longer applies to any of them -- reusing the prefills
      // already fetched for this screen is correct, not stale.
      setInputs(buildInputsFromDetail(refreshed, prefills));
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

              {readiness && !readiness.completed && detail.status === 'pending' ? (
                <>
                  <ThemedText themeColor="textSecondary" style={styles.readinessIntro}>
                    Quick check before you start -- {readiness.formName}.
                  </ThemedText>

                  {readiness.questions.map((question, index) => {
                    const typeDefinition = getQuestionTypeDefinition(question.questionType);
                    return (
                      <ThemedView key={question.id} type="backgroundElement" style={styles.exerciseCard}>
                        <ThemedText type="smallBold">
                          {index + 1}. {question.label}
                        </ThemedText>
                        <AnswerInput
                          answerKind={typeDefinition.answerKind}
                          config={question.config}
                          value={readinessAnswers[question.id] ?? null}
                          onChange={(value) =>
                            setReadinessAnswers((current) => ({ ...current, [question.id]: value }))
                          }
                        />
                      </ThemedView>
                    );
                  })}

                  {readinessError && <ThemedText style={styles.error}>{readinessError}</ThemedText>}

                  <Pressable
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                    onPress={handleSubmitReadiness}
                    disabled={submittingReadiness}>
                    {submittingReadiness ? (
                      <ActivityIndicator color={Colors.text} />
                    ) : (
                      <ThemedText type="smallBold" style={styles.primaryButtonText}>
                        Continue to workout
                      </ThemedText>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  {detail.exercises.length === 0 && (
                    <ThemedText themeColor="textSecondary">This workout has no exercises.</ThemedText>
                  )}

                  {detail.exercises.map((exercise, index) => {
                    const swap = swaps[exercise.id];
                    const shown = displayExercise(exercise, swap);
                    const input = inputs[exercise.id] ?? { weight: '', reps: '' };
                    const alreadyLogged = exercise.loggedWeight !== null || exercise.loggedReps !== null;
                    const prefill = prefills[exercise.id];
                    const prefillLabel =
                      !alreadyLogged && prefill?.source === 'previous_session'
                        ? 'Prefilled from your last session with this exercise -- edit if today is different.'
                        : !alreadyLogged && prefill?.source === 'baseline'
                          ? "Prefilled from your coach's suggested starting point -- edit if you know better."
                          : null;
                    const noSuggestion = !alreadyLogged && (!prefill || prefill.source === 'none');

                    return (
                      <ThemedView key={exercise.id} type="backgroundElement" style={styles.exerciseCard}>
                        <View style={styles.exerciseHeader}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {index + 1}
                          </ThemedText>
                          <View style={styles.exerciseText}>
                            <ThemedText type="smallBold">{shown.name}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              Target: {exercise.setsReps}
                            </ThemedText>
                            {shown.isSwapped && (
                              <ThemedText type="small" style={styles.swappedNote}>
                                Swapped for today -- originally {shown.originalName}
                              </ThemedText>
                            )}
                          </View>
                          {detail.status === 'pending' && exercise.muscleGroup && (
                            <Pressable
                              onPress={() =>
                                shown.isSwapped ? handleUndoSwap(exercise.id) : openSwapPicker(exercise.id)
                              }
                              disabled={swappingId === exercise.id}
                              hitSlop={8}>
                              {swappingId === exercise.id ? (
                                <ActivityIndicator size="small" />
                              ) : (
                                <ThemedText type="linkPrimary">{shown.isSwapped ? 'Undo' : 'Swap'}</ThemedText>
                              )}
                            </Pressable>
                          )}
                        </View>

                        {detail.status === 'completed' ? (
                          <ThemedText type="small">
                            Logged: {exercise.loggedWeight ?? '—'} weight · {exercise.loggedReps ?? '—'} reps
                          </ThemedText>
                        ) : (
                          <>
                            <View style={styles.inputsRow}>
                              <TextInput
                                value={input.weight}
                                onChangeText={(value) => updateInput(exercise.id, 'weight', value)}
                                placeholder={noSuggestion ? 'Enter your starting weight' : 'Weight'}
                                placeholderTextColor={theme.textSecondary}
                                keyboardType="numeric"
                                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                              />
                              <TextInput
                                value={input.reps}
                                onChangeText={(value) => updateInput(exercise.id, 'reps', value)}
                                placeholder={noSuggestion ? 'Enter your starting reps' : 'Reps'}
                                placeholderTextColor={theme.textSecondary}
                                keyboardType="numeric"
                                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                              />
                            </View>
                            {prefillLabel && (
                              <ThemedText type="small" themeColor="textSecondary" style={styles.prefillLabel}>
                                {prefillLabel}
                              </ThemedText>
                            )}
                          </>
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
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={swapPickerExerciseId !== null} transparent animationType="fade" onRequestClose={closeSwapPicker}>
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              Swap exercise
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
              For today's session only -- your programme doesn't change.
            </ThemedText>

            {loadingLibrary && <ActivityIndicator style={styles.smallLoader} />}
            {!loadingLibrary && libraryError && <ThemedText style={styles.error}>{libraryError}</ThemedText>}

            {!loadingLibrary && !libraryError && (
              <TextInput
                value={swapSearch}
                onChangeText={setSwapSearch}
                placeholder="Search alternatives"
                placeholderTextColor={theme.textSecondary}
                autoFocus
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            )}

            {swapError && <ThemedText style={styles.error}>{swapError}</ThemedText>}

            {!loadingLibrary && !libraryError && (
              <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                {(() => {
                  const pickerExercise = detail?.exercises.find((e) => e.id === swapPickerExerciseId) ?? null;
                  if (!pickerExercise) return null;
                  const query = swapSearch.trim().toLowerCase();
                  const candidates = libraryExercises.filter(
                    (candidate) =>
                      candidate.muscleGroup === pickerExercise.muscleGroup &&
                      candidate.id !== pickerExercise.exerciseLibraryId &&
                      (query === '' || candidate.name.toLowerCase().includes(query))
                  );

                  if (candidates.length === 0) {
                    return (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.noResults}>
                        No other {pickerExercise.muscleGroup} exercises match.
                      </ThemedText>
                    );
                  }

                  return candidates.map((candidate) => (
                    <Pressable
                      key={candidate.id}
                      onPress={() => handleSelectReplacement(pickerExercise.id, candidate)}
                      disabled={swappingId === pickerExercise.id}>
                      <View style={styles.resultRow}>
                        <ThemedText type="small" style={styles.resultName}>
                          {candidate.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {candidate.category}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ));
                })()}
              </ScrollView>
            )}

            <Pressable style={styles.cancelButton} onPress={closeSwapPicker}>
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
  readinessIntro: {
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
  prefillLabel: {
    marginTop: Spacing.half,
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
  swappedNote: {
    color: Colors.tealBright,
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
    marginBottom: Spacing.half,
  },
  modalSubtitle: {
    marginBottom: Spacing.two,
  },
  smallLoader: {
    marginVertical: Spacing.one,
  },
  resultsList: {
    maxHeight: 320,
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
  noResults: {
    textAlign: 'center',
    marginVertical: Spacing.two,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
