import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/question-answer-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  finishSession,
  getAssignmentDetail,
  getSetPrefills,
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
import {
  clearLocalSetLogsIfFullySynced,
  deleteSetLog,
  flushPendingSetLogs,
  getMergedSetLogs,
  saveSetLog,
  setLogKey,
  type SetLogValues,
} from '@/lib/set-logging';
import { SET_TYPE_DESCRIPTIONS, setTypeLabel } from '@/lib/set-types';
import { awardWorkoutXp } from '@/lib/xp';

const DEFAULT_REST_SECONDS = 90;
const REST_STEP_SECONDS = 15;
const FLUSH_INTERVAL_MS = 20000;

/** A sensible starting value per answer kind for a not-yet-answered
 * readiness question -- 0/blank would be a real (wrong) answer for a
 * scale, so that starts at null instead. */
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

/** What's actually shown/logged for one exercise slot right now -- the
 * swap's replacement if this session has one for it, otherwise exactly
 * what the workout/programme originally prescribed. The slot's own id
 * (and therefore where workout_logs attaches) never changes either way.
 * Tagged set-types deliberately DO carry over through a swap -- a
 * technique tag describes the session's structure ("set 3 here is a
 * drop set"), not the specific exercise filling the slot, so it stays
 * meaningful regardless of what got swapped in. */
function displayExercise(exercise: AssignmentDetail['exercises'][number], swap: ExerciseSwap | undefined) {
  if (!swap) {
    return {
      ...exercise,
      isSwapped: false as const,
      originalName: exercise.name,
    };
  }
  return {
    ...exercise,
    name: swap.replacementName,
    exerciseLibraryId: swap.replacementExerciseLibraryId,
    isSwapped: true as const,
    originalName: exercise.name,
  };
}

type SetRowState = {
  checked: boolean;
  weight: string;
  reps: string;
  rpe: number | null;
};

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function blankSetRow(prefill: ExercisePrefill | undefined): SetRowState {
  return {
    checked: false,
    weight: prefill && prefill.weight !== null ? String(prefill.weight) : '',
    reps: prefill && prefill.reps !== null ? String(prefill.reps) : '',
    rpe: null,
  };
}

function loggedSetRow(logged: SetLogValues): SetRowState {
  return {
    checked: true,
    weight: logged.weight !== null ? String(logged.weight) : '',
    reps: logged.reps !== null ? String(logged.reps) : '',
    rpe: logged.rpe,
  };
}

export default function AssignedWorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { session } = useAuth();
  const clientId = session?.user.id;

  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [swaps, setSwaps] = useState<Record<string, ExerciseSwap>>({});
  const [libraryExercises, setLibraryExercises] = useState<ExerciseSummary[]>([]);
  const [libraryById, setLibraryById] = useState<Record<string, ExerciseSummary>>({});
  const [prefills, setPrefills] = useState<Record<string, ExercisePrefill>>({});
  const [setRows, setSetRows] = useState<Record<string, SetRowState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setError_, setSetError] = useState<string | null>(null);

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [readinessAnswers, setReadinessAnswers] = useState<Record<string, AnswerValue>>({});
  const [submittingReadiness, setSubmittingReadiness] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const [swapPickerExerciseId, setSwapPickerExerciseId] = useState<string | null>(null);
  const [swapSearch, setSwapSearch] = useState('');
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  const [restDuration, setRestDuration] = useState(DEFAULT_REST_SECONDS);
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    if (!id || !clientId) return;
    setLoading(true);
    setError(null);
    try {
      const [assignmentData, readinessData, swapMap, library] = await Promise.all([
        getAssignmentDetail(id),
        getReadinessStatusForAssignment(id),
        listExerciseSwapsForAssignment(id),
        listExerciseLibrarySummaries(),
      ]);

      setDetail(assignmentData);
      setReadiness(readinessData);
      setSwaps(swapMap);
      setLibraryExercises(library);
      setLibraryById(Object.fromEntries(library.map((entry) => [entry.id, entry])));

      const answers: Record<string, AnswerValue> = {};
      readinessData.questions.forEach((question) => {
        answers[question.id] = blankReadinessAnswer(question);
      });
      setReadinessAnswers(answers);

      const effectiveExercises = assignmentData.exercises.map((exercise) => {
        const swap = swapMap[exercise.id];
        return swap
          ? {
              id: exercise.id,
              exerciseLibraryId: swap.replacementExerciseLibraryId,
              baselineWeight: null,
              baselineReps: null,
              totalSets: exercise.totalSets,
            }
          : {
              id: exercise.id,
              exerciseLibraryId: exercise.exerciseLibraryId,
              baselineWeight: exercise.baselineWeight,
              baselineReps: exercise.baselineReps,
              totalSets: exercise.totalSets,
            };
      });

      const [prefillMap, mergedLogs] = await Promise.all([
        getSetPrefills(clientId, assignmentData.id, effectiveExercises),
        getMergedSetLogs(assignmentData.id),
      ]);
      setPrefills(prefillMap);

      const rows: Record<string, SetRowState> = {};
      assignmentData.exercises.forEach((exercise) => {
        for (let setNumber = 1; setNumber <= exercise.totalSets; setNumber++) {
          const key = setLogKey(exercise.id, setNumber);
          const logged = mergedLogs[key];
          rows[key] = logged ? loggedSetRow(logged) : blankSetRow(prefillMap[key]);
        }
      });
      setSetRows(rows);

      // Best-effort retry of anything left over from a previous visit --
      // never blocks rendering on this.
      flushPendingSetLogs(assignmentData.id, clientId).catch((err) => console.error('Flush failed:', err));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this workout.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Deliberately only re-runs when the assignment or signed-in client
    // changes -- `load` itself closes over plenty of state that would
    // otherwise cause an infinite refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, clientId]);

  // Quiet periodic retry while this screen stays open, independent of
  // any user action -- a queued set doesn't have to wait on the client
  // doing something else to get another chance to sync.
  useEffect(() => {
    if (!id || !clientId) return;
    const interval = setInterval(() => {
      flushPendingSetLogs(id, clientId).catch((err) => console.error('Flush failed:', err));
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, clientId]);

  useEffect(() => {
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, []);

  const startRestTimer = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestSecondsLeft(restDuration);
    restIntervalRef.current = setInterval(() => {
      setRestSecondsLeft((current) => {
        if (current === null || current <= 1) {
          if (restIntervalRef.current) clearInterval(restIntervalRef.current);
          return current === null ? null : 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const adjustRestTimer = (deltaSeconds: number) => {
    setRestSecondsLeft((current) => (current === null ? current : Math.max(0, current + deltaSeconds)));
    setRestDuration((current) => Math.max(REST_STEP_SECONDS, current + deltaSeconds));
  };

  const dismissRestTimer = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestSecondsLeft(null);
  };

  const handleSubmitReadiness = async () => {
    setReadinessError(null);
    if (!session || !readiness || !id) return;

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

  const updateSetField = (key: string, field: 'weight' | 'reps', value: string) => {
    setSetRows((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  };

  const updateSetRpe = (key: string, value: AnswerValue) => {
    setSetRows((current) => ({
      ...current,
      [key]: { ...current[key], rpe: typeof value === 'number' ? value : null },
    }));
  };

  const toggleSetComplete = async (exerciseId: string, setNumber: number) => {
    setSetError(null);
    if (!clientId || !id) return;
    const key = setLogKey(exerciseId, setNumber);
    const row = setRows[key];
    if (!row) return;

    if (row.checked) {
      setSetRows((current) => ({ ...current, [key]: { ...current[key], checked: false } }));
      await deleteSetLog(id, exerciseId, setNumber);
      return;
    }

    const weight = row.weight.trim() === '' ? null : Number(row.weight);
    const reps = row.reps.trim() === '' ? null : Number(row.reps);

    if ((row.weight.trim() !== '' && Number.isNaN(weight)) || (row.reps.trim() !== '' && Number.isNaN(reps))) {
      setSetError('Weight and reps must be numbers.');
      return;
    }
    if (weight === null && reps === null) {
      setSetError('Enter a weight or reps before checking a set complete.');
      return;
    }

    setSetRows((current) => ({ ...current, [key]: { ...current[key], checked: true } }));
    await saveSetLog(id, clientId, exerciseId, setNumber, { weight, reps, rpe: row.rpe });
    startRestTimer();
    flushPendingSetLogs(id, clientId).catch((err) => console.error('Flush failed:', err));
  };

  const openSwapPicker = (workoutExerciseId: string) => {
    setSwapPickerExerciseId(workoutExerciseId);
    setSwapSearch('');
    setSwapError(null);
  };

  const closeSwapPicker = () => setSwapPickerExerciseId(null);

  /** Clears any sets already checked off under one exercise identity --
   * used both when swapping (the old numbers belonged to the exercise
   * being replaced) and when undoing (whatever was logged during the
   * swap belonged to the replacement, not the original). */
  const clearLoggedSetsForExercise = async (exercise: AssignmentDetail['exercises'][number]) => {
    if (!id) return;
    for (let setNumber = 1; setNumber <= exercise.totalSets; setNumber++) {
      const key = setLogKey(exercise.id, setNumber);
      if (setRows[key]?.checked) {
        await deleteSetLog(id, exercise.id, setNumber);
      }
    }
  };

  const handleSelectReplacement = async (workoutExerciseId: string, replacement: ExerciseSummary) => {
    setSwapError(null);
    if (!clientId || !detail || !id) return;
    const exercise = detail.exercises.find((e) => e.id === workoutExerciseId);
    if (!exercise) return;

    setSwappingId(workoutExerciseId);
    try {
      await clearLoggedSetsForExercise(exercise);
      await swapExerciseForSession(id, clientId, workoutExerciseId, {
        exerciseLibraryId: replacement.id,
        name: replacement.name,
      });
      const swapMap = await listExerciseSwapsForAssignment(id);
      setSwaps(swapMap);

      const effective = {
        id: exercise.id,
        exerciseLibraryId: replacement.id,
        baselineWeight: null,
        baselineReps: null,
        totalSets: exercise.totalSets,
      };
      const newPrefills = await getSetPrefills(clientId, id, [effective]);
      setPrefills((current) => ({ ...current, ...newPrefills }));
      setSetRows((current) => {
        const next = { ...current };
        for (let setNumber = 1; setNumber <= exercise.totalSets; setNumber++) {
          const key = setLogKey(exercise.id, setNumber);
          next[key] = blankSetRow(newPrefills[key]);
        }
        return next;
      });
      setSwapPickerExerciseId(null);
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : 'Something went wrong swapping this exercise.');
    } finally {
      setSwappingId(null);
    }
  };

  const handleUndoSwap = async (workoutExerciseId: string) => {
    if (!detail || !clientId || !id) return;
    const exercise = detail.exercises.find((e) => e.id === workoutExerciseId);
    if (!exercise) return;

    setSwappingId(workoutExerciseId);
    try {
      await clearLoggedSetsForExercise(exercise);
      await undoExerciseSwap(id, workoutExerciseId);
      const swapMap = await listExerciseSwapsForAssignment(id);
      setSwaps(swapMap);

      const effective = {
        id: exercise.id,
        exerciseLibraryId: exercise.exerciseLibraryId,
        baselineWeight: exercise.baselineWeight,
        baselineReps: exercise.baselineReps,
        totalSets: exercise.totalSets,
      };
      const newPrefills = await getSetPrefills(clientId, id, [effective]);
      setPrefills((current) => ({ ...current, ...newPrefills }));
      setSetRows((current) => {
        const next = { ...current };
        for (let setNumber = 1; setNumber <= exercise.totalSets; setNumber++) {
          const key = setLogKey(exercise.id, setNumber);
          next[key] = blankSetRow(newPrefills[key]);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo that swap.');
    } finally {
      setSwappingId(null);
    }
  };

  const handleFinishSession = async () => {
    if (!detail || !clientId) return;
    setFinishing(true);
    setFinishError(null);
    try {
      await finishSession(detail.id);
      try {
        await awardWorkoutXp(clientId, detail.id, todayISODate());
      } catch (xpErr) {
        console.error('Failed to award workout XP:', xpErr);
      }
      await flushPendingSetLogs(detail.id, clientId);
      await clearLocalSetLogsIfFullySynced(detail.id);
      await load();
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Something went wrong finishing this session.');
    } finally {
      setFinishing(false);
    }
  };

  const showingReadinessGate = readiness && !readiness.completed && detail?.status === 'pending';

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

              {showingReadinessGate ? (
                <>
                  <ThemedText themeColor="textSecondary" style={styles.readinessIntro}>
                    Quick check before you start -- {readiness!.formName}.
                  </ThemedText>

                  {readiness!.questions.map((question, index) => {
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
                  {restSecondsLeft !== null && (
                    <ThemedView type="backgroundElement" style={styles.restTimerCard}>
                      <ThemedText type="smallBold">Rest</ThemedText>
                      <ThemedText type="title" style={styles.restTimerValue}>
                        {Math.floor(restSecondsLeft / 60)}:{String(restSecondsLeft % 60).padStart(2, '0')}
                      </ThemedText>
                      <View style={styles.restTimerControls}>
                        <Pressable onPress={() => adjustRestTimer(-REST_STEP_SECONDS)}>
                          <ThemedText type="linkPrimary">-15s</ThemedText>
                        </Pressable>
                        <Pressable onPress={() => adjustRestTimer(REST_STEP_SECONDS)}>
                          <ThemedText type="linkPrimary">+15s</ThemedText>
                        </Pressable>
                        <Pressable onPress={dismissRestTimer}>
                          <ThemedText type="linkPrimary">Skip</ThemedText>
                        </Pressable>
                      </View>
                    </ThemedView>
                  )}

                  {detail.exercises.length === 0 && (
                    <ThemedText themeColor="textSecondary">This workout has no exercises.</ThemedText>
                  )}

                  {detail.exercises.map((exercise, index) => {
                    const swap = swaps[exercise.id];
                    const shown = displayExercise(exercise, swap);
                    const description = shown.isSwapped
                      ? (libraryById[shown.exerciseLibraryId ?? '']?.description ?? null)
                      : exercise.description;

                    return (
                      <ThemedView key={exercise.id} type="backgroundElement" style={styles.exerciseCard}>
                        <View style={styles.exerciseHeader}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {index + 1}
                          </ThemedText>
                          <View style={styles.exerciseText}>
                            <ThemedText type="smallBold">{shown.name}</ThemedText>
                            {description && (
                              <ThemedText type="small" themeColor="textSecondary">
                                {description}
                              </ThemedText>
                            )}
                            <ThemedText type="small" themeColor="textSecondary">
                              Target: {exercise.setsReps}
                              {!shown.isSwapped && exercise.baselineWeight !== null
                                ? ` · Suggested start: ${exercise.baselineWeight}kg`
                                : ''}
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

                        {Array.from({ length: exercise.totalSets }, (_, i) => i + 1).map((setNumber) => {
                          const key = setLogKey(exercise.id, setNumber);
                          const row = setRows[key] ?? { checked: false, weight: '', reps: '', rpe: null };
                          const prefill = prefills[key];
                          const tag = exercise.taggedSets.find((t) => t.setNumber === setNumber);
                          const prefillLabel =
                            !row.checked && prefill?.source === 'previous_session'
                              ? 'From your last session with this exercise'
                              : !row.checked && prefill?.source === 'baseline'
                                ? "Coach's suggested starting point"
                                : null;
                          const noSuggestion = !row.checked && (!prefill || prefill.source === 'none');

                          return (
                            <View key={key} style={styles.setRow}>
                              <View style={styles.setRowTop}>
                                <Pressable
                                  onPress={() => toggleSetComplete(exercise.id, setNumber)}
                                  disabled={detail.status === 'completed'}
                                  style={[styles.checkbox, row.checked && styles.checkboxChecked]}
                                  hitSlop={8}>
                                  {row.checked && (
                                    <ThemedText type="smallBold" style={styles.checkboxMark}>
                                      ✓
                                    </ThemedText>
                                  )}
                                </Pressable>
                                <ThemedText type="small" style={styles.setNumberLabel}>
                                  Set {setNumber}
                                </ThemedText>
                                {tag && tag.setType !== 'normal' && (
                                  <ThemedText type="small" style={styles.setTypeBadge}>
                                    {setTypeLabel(tag.setType)}
                                  </ThemedText>
                                )}
                              </View>

                              {tag && tag.setType !== 'normal' && SET_TYPE_DESCRIPTIONS[tag.setType] && (
                                <ThemedText type="small" themeColor="textSecondary" style={styles.setTypeDescription}>
                                  {SET_TYPE_DESCRIPTIONS[tag.setType]}
                                </ThemedText>
                              )}

                              <View style={styles.inputsRow}>
                                <TextInput
                                  value={row.weight}
                                  onChangeText={(value) => updateSetField(key, 'weight', value)}
                                  editable={detail.status !== 'completed'}
                                  placeholder={noSuggestion ? 'Weight (kg)' : 'Weight'}
                                  placeholderTextColor={theme.textSecondary}
                                  keyboardType="numeric"
                                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                                />
                                <TextInput
                                  value={row.reps}
                                  onChangeText={(value) => updateSetField(key, 'reps', value)}
                                  editable={detail.status !== 'completed'}
                                  placeholder={noSuggestion ? 'Reps' : 'Reps'}
                                  placeholderTextColor={theme.textSecondary}
                                  keyboardType="numeric"
                                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                                />
                              </View>

                              <ThemedText type="small" themeColor="textSecondary" style={styles.rpeLabel}>
                                RPE
                              </ThemedText>
                              <AnswerInput
                                answerKind="scale"
                                config={{ min: 1, max: 10 }}
                                value={row.rpe}
                                onChange={(value) => updateSetRpe(key, value)}
                              />

                              {prefillLabel && (
                                <ThemedText type="small" themeColor="textSecondary" style={styles.prefillLabel}>
                                  {prefillLabel}
                                </ThemedText>
                              )}
                            </View>
                          );
                        })}
                      </ThemedView>
                    );
                  })}

                  {setError_ && <ThemedText style={styles.error}>{setError_}</ThemedText>}
                  {finishError && <ThemedText style={styles.error}>{finishError}</ThemedText>}

                  {detail.status === 'pending' && (
                    <Pressable
                      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                      onPress={handleFinishSession}
                      disabled={finishing}>
                      {finishing ? (
                        <ActivityIndicator color={Colors.text} />
                      ) : (
                        <ThemedText type="smallBold" style={styles.primaryButtonText}>
                          Finish Session
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

            <TextInput
              value={swapSearch}
              onChangeText={setSwapSearch}
              placeholder="Search alternatives"
              placeholderTextColor={theme.textSecondary}
              autoFocus
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />

            {swapError && <ThemedText style={styles.error}>{swapError}</ThemedText>}

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
  restTimerCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  restTimerValue: {
    fontSize: 36,
  },
  restTimerControls: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.one,
  },
  exerciseCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  exerciseText: {
    flex: 1,
    gap: Spacing.half,
  },
  swappedNote: {
    color: Colors.tealBright,
  },
  setRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  setRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.one,
    borderWidth: 2,
    borderColor: Colors.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  checkboxMark: {
    color: Colors.text,
  },
  setNumberLabel: {
    fontWeight: '700',
  },
  setTypeBadge: {
    color: Colors.tealBright,
    fontWeight: '700',
  },
  setTypeDescription: {
    marginLeft: Spacing.four,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rpeLabel: {
    marginTop: Spacing.half,
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
