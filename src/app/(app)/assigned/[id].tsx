import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { AnswerInput } from '@/components/question-answer-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Colors, Glow, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage } from '@/lib/errors';
import {
  finishSession,
  getAssignmentDetail,
  getSetPrefills,
  type AssignmentDetail,
  type ExercisePrefill,
} from '@/lib/assignments';
import { listExerciseLibrarySummaries, type ExerciseSummary } from '@/lib/exercise-library';
import { listExerciseRemovalsForAssignment, removeExerciseForSession } from '@/lib/exercise-removals';
import {
  listExerciseSwapsForAssignment,
  swapExerciseForSession,
  undoExerciseSwap,
  type ExerciseSwap,
} from '@/lib/exercise-swaps';
import { getQuestionTypeDefinition, type AnswerValue } from '@/lib/question-types';
import { getReadinessStatusForAssignment, submitReadinessResponses, type ReadinessStatus } from '@/lib/readiness';
import { getExercisePersonalBests, type ExercisePersonalBest } from '@/lib/session-scorecard';
import {
  clearLocalSetLogsIfFullySynced,
  deleteSetLog,
  flushPendingSetLogs,
  getMergedSetLogs,
  getSetLogTimeRange,
  saveSetLog,
  setLogKey,
  type SetLogValues,
} from '@/lib/set-logging';
import { SET_TYPE_DESCRIPTIONS, setTypeLabel } from '@/lib/set-types';
import { clearSessionSnapshot, loadSessionSnapshot, saveSessionSnapshot } from '@/lib/session-snapshot';
import { awardWorkoutXp } from '@/lib/xp';

const DEFAULT_REST_SECONDS = 90;
const REST_STEP_SECONDS = 15;
const FLUSH_INTERVAL_MS = 20000;
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

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

/** `timeZone: 'UTC'` matches how assigned_date is stored/compared
 * everywhere else in this app -- same reasoning nutrition.tsx's own
 * formatDisplayDate documents for the identical pitfall. */
function formatWeekday(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long' });
}

/** M:SS under an hour, H:MM:SS beyond -- a live-ticking elapsed-time
 * format, distinct from the coarser "Xh Ym" the post-workout scorecard
 * uses for its one-time static summary (see session-scorecard.ts). */
function formatElapsed(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
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

/**
 * Live per-set PR detection, shared between two callers: backfilling
 * flags for sets already checked before this screen even loaded (walks
 * every exercise/set in order, since merged set logs don't carry a
 * timestamp to sort by -- a reasonable stand-in for "the order they
 * were actually done in"), and updating a single set's flag the instant
 * it's newly checked. Both start from the same all-time-bests seed
 * (every OTHER session, see getExercisePersonalBests) and update it as
 * they go, so a second strong set later in the walk still compares
 * against the first one just seen, not just against history.
 */
function computePrFlags(
  exercises: { id: string; libraryId: string | null; totalSets: number }[],
  rows: Record<string, SetRowState>,
  seedBests: Record<string, ExercisePersonalBest>
): { flags: Record<string, { weightPr: boolean; volPr: boolean }>; bests: Record<string, ExercisePersonalBest> } {
  const bests: Record<string, ExercisePersonalBest> = { ...seedBests };
  const flags: Record<string, { weightPr: boolean; volPr: boolean }> = {};

  exercises.forEach(({ id: exerciseId, libraryId, totalSets }) => {
    if (!libraryId) return;
    for (let setNumber = 1; setNumber <= totalSets; setNumber++) {
      const key = setLogKey(exerciseId, setNumber);
      const row = rows[key];
      if (!row || !row.checked) continue;

      const weight = row.weight.trim() !== '' ? Number(row.weight) : null;
      const reps = row.reps.trim() !== '' ? Number(row.reps) : null;
      if (weight === null || Number.isNaN(weight)) continue;
      const volume = reps !== null && !Number.isNaN(reps) ? weight * reps : null;

      const current = bests[libraryId] ?? { bestWeight: null, bestVolume: null };
      const weightPr = current.bestWeight === null || weight > current.bestWeight;
      const volPr = volume !== null && (current.bestVolume === null || volume > current.bestVolume);

      flags[key] = { weightPr, volPr };
      bests[libraryId] = {
        bestWeight: weightPr ? weight : current.bestWeight,
        bestVolume: volPr ? volume : current.bestVolume,
      };
    }
  });

  return { flags, bests };
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

  // Exercises removed for this session only (see exercise-removals.ts) --
  // same "session-only override, programme untouched" shape as swaps.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // + Add Set -- how many sets beyond what the programme prescribed
  // have been added this session, per exercise slot.
  const [extraSets, setExtraSets] = useState<Record<string, number>>({});

  // Live per-set PR detection: seeded once from every OTHER session's
  // all-time bests, then bumped in memory the instant a set beats it --
  // so a second strong set later in the SAME session still compares
  // against the first, not just against history.
  const [runningBests, setRunningBests] = useState<Record<string, ExercisePersonalBest>>({});
  const [prFlags, setPrFlags] = useState<Record<string, { weightPr: boolean; volPr: boolean }>>({});

  // The live summary bar's duration anchor -- when the first set was
  // actually logged this session (resumed from the server on reload, or
  // set the instant the very first set is checked this mount). Null
  // means nothing logged yet, so the timer reads "not started" rather
  // than fabricating a start time from when the screen happened to open.
  const [sessionStartAt, setSessionStartAt] = useState<string | null>(null);
  const [sessionEndAt, setSessionEndAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [restDuration, setRestDuration] = useState(DEFAULT_REST_SECONDS);
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The client's own rating of how the WHOLE session felt -- separate
  // from the per-set RPE captured on each exercise's last set, saved
  // once, at the same time the session is marked complete.
  const [sessionRpe, setSessionRpe] = useState<number | null>(null);

  // Kept in sync via effects below so the 10-minute snapshot timer
  // always reads the LATEST values, without resetting the timer itself
  // every time a set row or the session RPE changes.
  const setRowsRef = useRef(setRows);
  const sessionRpeRef = useRef(sessionRpe);
  const extraSetsRef = useRef(extraSets);
  useEffect(() => {
    setRowsRef.current = setRows;
  }, [setRows]);
  useEffect(() => {
    sessionRpeRef.current = sessionRpe;
  }, [sessionRpe]);
  useEffect(() => {
    extraSetsRef.current = extraSets;
  }, [extraSets]);

  const load = async () => {
    if (!id || !clientId) return;
    setLoading(true);
    setError(null);
    try {
      const [assignmentData, readinessData, swapMap, removalSet, library] = await Promise.all([
        getAssignmentDetail(id),
        getReadinessStatusForAssignment(id),
        listExerciseSwapsForAssignment(id),
        listExerciseRemovalsForAssignment(id),
        listExerciseLibrarySummaries(),
      ]);

      setDetail(assignmentData);
      setSessionRpe(assignmentData.sessionRpe);
      setReadiness(readinessData);
      setSwaps(swapMap);
      setRemovedIds(removalSet);
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

      const libraryIds = effectiveExercises.map((e) => e.exerciseLibraryId).filter((v): v is string => v !== null);

      const [prefillMap, mergedLogs, snapshot, timeRange, seedBests] = await Promise.all([
        getSetPrefills(clientId, assignmentData.id, effectiveExercises),
        getMergedSetLogs(assignmentData.id),
        assignmentData.status === 'pending' ? loadSessionSnapshot(assignmentData.id) : Promise.resolve(null),
        getSetLogTimeRange(assignmentData.id),
        getExercisePersonalBests(clientId, assignmentData.id, libraryIds),
      ]);
      setPrefills(prefillMap);

      // How many sets to actually render per exercise -- the programme's
      // own count, widened to cover whatever's already been logged past
      // it (a synced "+ Add Set" from a previous visit) or snapshotted
      // as added-but-not-yet-logged this same visit.
      const extra: Record<string, number> = {};
      assignmentData.exercises.forEach((exercise) => {
        let maxLoggedSetNumber = 0;
        Object.keys(mergedLogs).forEach((key) => {
          const [exerciseId, setNumberStr] = key.split(':');
          if (exerciseId === exercise.id) maxLoggedSetNumber = Math.max(maxLoggedSetNumber, Number(setNumberStr));
        });
        const fromLogs = Math.max(0, maxLoggedSetNumber - exercise.totalSets);
        const fromSnapshot = snapshot?.extraSetsByExercise?.[exercise.id] ?? 0;
        extra[exercise.id] = Math.max(fromLogs, fromSnapshot);
      });
      setExtraSets(extra);

      const rows: Record<string, SetRowState> = {};
      assignmentData.exercises.forEach((exercise) => {
        const totalSets = exercise.totalSets + extra[exercise.id];
        for (let setNumber = 1; setNumber <= totalSets; setNumber++) {
          const key = setLogKey(exercise.id, setNumber);
          const logged = mergedLogs[key];
          rows[key] = logged ? loggedSetRow(logged) : blankSetRow(prefillMap[key]);
        }
      });

      // Restore anything the 10-minute snapshot caught that the per-set
      // system never did -- ONLY for sets still unchecked. A checked set
      // is already authoritative from the server/local per-set cache
      // above; this is strictly a safety net under that, never a
      // replacement for it, and never touches a finished session.
      if (snapshot) {
        for (const [key, snapshotRow] of Object.entries(snapshot.setRows)) {
          if (rows[key] && !rows[key].checked) {
            rows[key] = { ...rows[key], weight: snapshotRow.weight, reps: snapshotRow.reps, rpe: snapshotRow.rpe };
          }
        }
        if (assignmentData.sessionRpe === null && snapshot.sessionRpe !== null) {
          setSessionRpe(snapshot.sessionRpe);
        }
      }
      setSetRows(rows);

      // Backfills PR flags for sets already checked before this load --
      // reopening a session (or reviewing a finished one) still shows
      // the same badges it would have shown live.
      const libraryIdByExercise: Record<string, string | null> = {};
      effectiveExercises.forEach((e) => {
        libraryIdByExercise[e.id] = e.exerciseLibraryId;
      });
      const { flags, bests } = computePrFlags(
        assignmentData.exercises.map((exercise) => ({
          id: exercise.id,
          libraryId: libraryIdByExercise[exercise.id],
          totalSets: exercise.totalSets + extra[exercise.id],
        })),
        rows,
        seedBests
      );
      setPrFlags(flags);
      setRunningBests(bests);

      // The live summary bar's duration anchor -- start ticking against
      // now for a pending session, or freeze at the actual last-logged
      // moment for one already finished.
      setSessionStartAt(timeRange?.earliest ?? null);
      setSessionEndAt(assignmentData.status === 'completed' ? (timeRange?.latest ?? null) : null);

      // Best-effort retry of anything left over from a previous visit --
      // never blocks rendering on this.
      flushPendingSetLogs(assignmentData.id, clientId).catch((err) => console.error('Flush failed:', err));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load this workout.'));
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

  // Belt-and-braces on top of the per-set system above: every 10 minutes
  // while the session is still open and pending, snapshot EVERYTHING
  // currently on screen (typed values on sets that haven't even been
  // checked yet, which the per-set system never captures at all) to its
  // own local storage spot, and give the per-set sync queue another
  // chance to retry beyond its own more frequent loop. Reads the refs,
  // not the state directly, so this doesn't reset the 10-minute clock
  // every time a field changes.
  useEffect(() => {
    if (!id || !clientId || detail?.status !== 'pending') return;
    const interval = setInterval(() => {
      saveSessionSnapshot(id, {
        setRows: setRowsRef.current,
        sessionRpe: sessionRpeRef.current,
        extraSetsByExercise: extraSetsRef.current,
        savedAt: new Date().toISOString(),
      }).catch((err) => console.error('Session snapshot failed:', err));
      flushPendingSetLogs(id, clientId).catch((err) => console.error('Flush failed:', err));
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, clientId, detail?.status]);

  useEffect(() => {
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, []);

  // Ticks the live summary bar's duration display once a second while
  // the session is actually underway -- a completed session's duration
  // is frozen (see sessionEndAt above), and one that's never had a set
  // checked yet has nothing to tick against.
  useEffect(() => {
    if (detail?.status !== 'pending' || !sessionStartAt) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [detail?.status, sessionStartAt]);

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
      setReadinessError(getErrorMessage(err, 'Something went wrong submitting your answers.'));
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

  /** The exercise actually being performed in this slot right now,
   * accounting for a swap -- same resolution displayExercise() uses for
   * display, needed here too since a PR is tracked by the real exercise
   * identity, not the slot. */
  const effectiveLibraryId = (exerciseId: string): string | null => {
    const swap = swaps[exerciseId];
    if (swap) return swap.replacementExerciseLibraryId;
    return detail?.exercises.find((e) => e.id === exerciseId)?.exerciseLibraryId ?? null;
  };

  const toggleSetComplete = async (exerciseId: string, setNumber: number) => {
    setSetError(null);
    if (!clientId || !id) return;
    const key = setLogKey(exerciseId, setNumber);
    const row = setRows[key];
    if (!row) return;

    if (row.checked) {
      setSetRows((current) => ({ ...current, [key]: { ...current[key], checked: false } }));
      // Doesn't roll runningBests back -- an uncheck-after-PR is a rare,
      // low-stakes edge case, and the next full load() recomputes PR
      // flags/bests from scratch anyway, so this is never permanently
      // wrong, just possibly briefly generous until then.
      setPrFlags((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
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

    // The live summary bar's duration starts ticking the instant the
    // very first set of this session is checked, if nothing was already
    // logged (and therefore already anchored it) on load.
    setSessionStartAt((current) => current ?? new Date().toISOString());

    const libraryId = effectiveLibraryId(exerciseId);
    if (libraryId && weight !== null) {
      const volume = reps !== null ? weight * reps : null;
      setRunningBests((current) => {
        const best = current[libraryId] ?? { bestWeight: null, bestVolume: null };
        const weightPr = best.bestWeight === null || weight > best.bestWeight;
        const volPr = volume !== null && (best.bestVolume === null || volume > best.bestVolume);
        setPrFlags((flags) => ({ ...flags, [key]: { weightPr, volPr } }));
        return {
          ...current,
          [libraryId]: {
            bestWeight: weightPr ? weight : best.bestWeight,
            bestVolume: volPr ? volume : best.bestVolume,
          },
        };
      });
    }

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
   * used when swapping (the old numbers belonged to the exercise being
   * replaced), undoing (whatever was logged during the swap belonged to
   * the replacement, not the original), and removing (they belonged to
   * the exercise being taken out of today's session). Covers any +
   * Add Set sets too, not just the programme's own count. */
  const clearLoggedSetsForExercise = async (exercise: AssignmentDetail['exercises'][number]) => {
    if (!id) return;
    const totalSets = exercise.totalSets + (extraSets[exercise.id] ?? 0);
    for (let setNumber = 1; setNumber <= totalSets; setNumber++) {
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
      setSwapError(getErrorMessage(err, 'Something went wrong swapping this exercise.'));
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
      setError(getErrorMessage(err, 'Failed to undo that swap.'));
    } finally {
      setSwappingId(null);
    }
  };

  const handleConfirmRemoveExercise = async () => {
    if (!confirmRemove || !clientId || !id || !detail) return;
    const exercise = detail.exercises.find((e) => e.id === confirmRemove.id);
    if (!exercise) return;

    setRemovingId(confirmRemove.id);
    setRemoveError(null);
    try {
      // Same reasoning as a swap: whatever was logged this session
      // belonged to the exercise being removed, so it goes with it.
      await clearLoggedSetsForExercise(exercise);
      await removeExerciseForSession(id, clientId, confirmRemove.id);
      setRemovedIds((current) => new Set(current).add(confirmRemove.id));
      setConfirmRemove(null);
    } catch (err) {
      setRemoveError(getErrorMessage(err, 'Failed to remove that exercise.'));
    } finally {
      setRemovingId(null);
    }
  };

  /** Adds one more set beyond what the programme prescribed, for this
   * session only -- a blank, unchecked row that behaves exactly like
   * any other set once logged (same saveSetLog/toggleSetComplete path,
   * no special-casing there). Snapshotted immediately, not just on the
   * usual 10-minute timer, so a quick add-then-reload doesn't lose it
   * before it's ever actually logged. */
  const handleAddSet = (exerciseId: string, currentTotalSets: number) => {
    const nextExtra = (extraSets[exerciseId] ?? 0) + 1;
    setExtraSets((current) => ({ ...current, [exerciseId]: nextExtra }));
    const newSetNumber = currentTotalSets + nextExtra;
    const key = setLogKey(exerciseId, newSetNumber);
    setSetRows((current) => ({ ...current, [key]: blankSetRow(undefined) }));

    if (id) {
      saveSessionSnapshot(id, {
        setRows: setRowsRef.current,
        sessionRpe: sessionRpeRef.current,
        extraSetsByExercise: { ...extraSetsRef.current, [exerciseId]: nextExtra },
        savedAt: new Date().toISOString(),
      }).catch((err) => console.error('Session snapshot failed:', err));
    }
  };

  const handleFinishSession = async () => {
    if (!detail || !clientId) return;
    setFinishing(true);
    setFinishError(null);
    try {
      await finishSession(detail.id, sessionRpe);
      try {
        await awardWorkoutXp(clientId, detail.id, todayISODate());
      } catch (xpErr) {
        console.error('Failed to award workout XP:', xpErr);
      }
      await flushPendingSetLogs(detail.id, clientId);
      await clearLocalSetLogsIfFullySynced(detail.id);
      await clearSessionSnapshot(detail.id);
      router.replace(`/assigned/complete/${detail.id}`);
    } catch (err) {
      setFinishError(getErrorMessage(err, 'Something went wrong finishing this session.'));
    } finally {
      setFinishing(false);
    }
  };

  // Summary bar stats -- pure computation over what's already checked
  // off, same "weight x reps, 0 if either is missing" convention
  // getSessionScorecard's own totalWeightLifted uses.
  const checkedRows = Object.values(setRows).filter((row) => row.checked);
  const totalVolume = checkedRows.reduce((sum, row) => {
    const weight = row.weight.trim() !== '' ? Number(row.weight) : null;
    const reps = row.reps.trim() !== '' ? Number(row.reps) : null;
    return sum + (weight !== null && reps !== null && !Number.isNaN(weight) && !Number.isNaN(reps) ? weight * reps : 0);
  }, 0);
  const completedSetsCount = checkedRows.length;

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
                {formatWeekday(detail.assignedDate)} - {detail.workoutName}
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

              {!showingReadinessGate && (
                <View style={styles.summaryBar}>
                  <View style={styles.summaryStat}>
                    <Ionicons name="time-outline" size={16} color={Colors.tealBright} />
                    <ThemedText type="smallBold">
                      {formatElapsed(
                        detail.status === 'completed'
                          ? sessionStartAt && sessionEndAt
                            ? Math.round((new Date(sessionEndAt).getTime() - new Date(sessionStartAt).getTime()) / 1000)
                            : null
                          : sessionStartAt
                            ? Math.max(0, Math.floor((nowTick - new Date(sessionStartAt).getTime()) / 1000))
                            : null
                      )}
                    </ThemedText>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryStat}>
                    <Ionicons name="trending-up-outline" size={16} color={Colors.tealBright} />
                    <ThemedText type="smallBold">{Math.round(totalVolume).toLocaleString()} kg</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      vol
                    </ThemedText>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryStat}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={Colors.tealBright} />
                    <ThemedText type="smallBold">{completedSetsCount}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      sets
                    </ThemedText>
                  </View>
                </View>
              )}

              {!showingReadinessGate && (
                <View style={styles.heartRateRow}>
                  <Ionicons name="heart-outline" size={16} color={Colors.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Heart Rate
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.heartRateValue}>
                    -- bpm · Connect a wearable
                  </ThemedText>
                </View>
              )}

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

                  {detail.exercises
                    .filter((exercise) => !removedIds.has(exercise.id))
                    .map((exercise, index) => {
                    const swap = swaps[exercise.id];
                    const shown = displayExercise(exercise, swap);
                    const description = shown.isSwapped
                      ? (libraryById[shown.exerciseLibraryId ?? '']?.description ?? null)
                      : exercise.description;
                    const category = shown.exerciseLibraryId ? libraryById[shown.exerciseLibraryId]?.category : null;
                    const totalSetsToRender = exercise.totalSets + (extraSets[exercise.id] ?? 0);

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
                            {category && (
                              <View style={styles.tagPill}>
                                <ThemedText type="small" style={styles.tagPillText}>
                                  {category} · {restDuration}s rest
                                </ThemedText>
                              </View>
                            )}
                          </View>
                          {detail.status === 'pending' && (
                            <View style={styles.exerciseActions}>
                              <Pressable
                                onPress={() => setConfirmRemove({ id: exercise.id, name: shown.name })}
                                disabled={removingId === exercise.id}
                                hitSlop={8}
                                accessibilityLabel={`Remove ${shown.name} for today`}>
                                {removingId === exercise.id ? (
                                  <ActivityIndicator size="small" />
                                ) : (
                                  <Ionicons name="trash-outline" size={18} color={Accent} />
                                )}
                              </Pressable>
                              {exercise.muscleGroup && (
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
                          )}
                        </View>

                        {totalSetsToRender > 0 && (
                          <View style={styles.setHeaderRow}>
                            <ThemedText type="small" themeColor="textSecondary" style={styles.setHeaderSet}>
                              Set
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary" style={styles.setHeaderInput}>
                              Weight
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary" style={styles.setHeaderInput}>
                              Reps
                            </ThemedText>
                          </View>
                        )}

                        {Array.from({ length: totalSetsToRender }, (_, i) => i + 1).map((setNumber) => {
                          const key = setLogKey(exercise.id, setNumber);
                          const row = setRows[key] ?? { checked: false, weight: '', reps: '', rpe: null };
                          const prefill = prefills[key];
                          const tag = exercise.taggedSets.find((t) => t.setNumber === setNumber);
                          const prefillLabel =
                            !row.checked && prefill?.source === 'baseline' ? "Coach's suggested starting point" : null;
                          const noSuggestion = !row.checked && (!prefill || prefill.source === 'none');
                          const pr = prFlags[key];

                          const lastWeight = prefill?.source === 'previous_session' ? prefill.weight : null;
                          const lastReps = prefill?.source === 'previous_session' ? prefill.reps : null;
                          const weightNum = row.weight.trim() !== '' ? Number(row.weight) : null;
                          const repsNum = row.reps.trim() !== '' ? Number(row.reps) : null;
                          const thisVolume =
                            row.checked && weightNum !== null && repsNum !== null ? weightNum * repsNum : null;
                          const lastVolume = lastWeight !== null && lastReps !== null ? lastWeight * lastReps : null;
                          const volumeDelta = thisVolume !== null && lastVolume !== null ? thisVolume - lastVolume : null;

                          return (
                            <View key={key} style={styles.setRow}>
                              {tag && tag.setType !== 'normal' && (
                                <ThemedText type="small" style={styles.setTypeBadge}>
                                  {setTypeLabel(tag.setType)}
                                </ThemedText>
                              )}
                              {tag && tag.setType !== 'normal' && SET_TYPE_DESCRIPTIONS[tag.setType] && (
                                <ThemedText type="small" themeColor="textSecondary" style={styles.setTypeDescription}>
                                  {SET_TYPE_DESCRIPTIONS[tag.setType]}
                                </ThemedText>
                              )}

                              <View style={styles.setRowMain}>
                                <ThemedText type="small" themeColor="textSecondary" style={styles.setNumberLabel}>
                                  × {setNumber}
                                </ThemedText>
                                <TextInput
                                  value={row.weight}
                                  onChangeText={(value) => updateSetField(key, 'weight', value)}
                                  editable={detail.status !== 'completed'}
                                  placeholder={noSuggestion ? 'kg' : '--'}
                                  placeholderTextColor={theme.textSecondary}
                                  keyboardType="numeric"
                                  style={[styles.bigInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                                />
                                <TextInput
                                  value={row.reps}
                                  onChangeText={(value) => updateSetField(key, 'reps', value)}
                                  editable={detail.status !== 'completed'}
                                  placeholder={noSuggestion ? 'reps' : '--'}
                                  placeholderTextColor={theme.textSecondary}
                                  keyboardType="numeric"
                                  style={[styles.bigInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                                />
                                <Pressable
                                  onPress={() => toggleSetComplete(exercise.id, setNumber)}
                                  disabled={detail.status === 'completed'}
                                  style={[styles.checkCircle, row.checked && styles.checkCircleChecked]}
                                  hitSlop={8}>
                                  {row.checked && (
                                    <ThemedText type="smallBold" style={styles.checkboxMark}>
                                      ✓
                                    </ThemedText>
                                  )}
                                </Pressable>
                              </View>

                              {lastWeight !== null && (
                                <View style={styles.lastRow}>
                                  <ThemedText type="small" themeColor="textSecondary">
                                    Last: {lastWeight}kg{lastReps !== null ? ` x ${lastReps}` : ''}
                                  </ThemedText>
                                  {volumeDelta !== null && volumeDelta !== 0 && (
                                    <ThemedText
                                      type="small"
                                      style={volumeDelta > 0 ? styles.volumeDeltaUp : styles.volumeDeltaDown}>
                                      {volumeDelta > 0 ? '↑' : '↓'} {volumeDelta > 0 ? '+' : ''}
                                      {Math.round(volumeDelta)}kg vol
                                    </ThemedText>
                                  )}
                                </View>
                              )}

                              {pr && (pr.weightPr || pr.volPr) && (
                                <View style={styles.prBadgeRow}>
                                  {pr.volPr && (
                                    <View style={styles.prBadge}>
                                      <ThemedText type="small" style={styles.prBadgeText}>
                                        🏆 Vol PR
                                      </ThemedText>
                                    </View>
                                  )}
                                  {pr.weightPr && (
                                    <View style={styles.prBadge}>
                                      <ThemedText type="small" style={styles.prBadgeText}>
                                        🏆 Weight PR
                                      </ThemedText>
                                    </View>
                                  )}
                                </View>
                              )}

                              {setNumber === totalSetsToRender && (
                                <>
                                  <ThemedText type="small" themeColor="textSecondary" style={styles.rpeLabel}>
                                    RPE for this exercise
                                  </ThemedText>
                                  <AnswerInput
                                    answerKind="scale"
                                    config={{ min: 1, max: 10 }}
                                    value={row.rpe}
                                    onChange={(value) => updateSetRpe(key, value)}
                                    compact
                                  />
                                </>
                              )}

                              {prefillLabel && (
                                <ThemedText type="small" themeColor="textSecondary" style={styles.prefillLabel}>
                                  {prefillLabel}
                                </ThemedText>
                              )}
                            </View>
                          );
                        })}

                        {detail.status === 'pending' && (
                          <Pressable onPress={() => handleAddSet(exercise.id, totalSetsToRender)} style={styles.addSetButton}>
                            <ThemedText type="linkPrimary">+ Add Set</ThemedText>
                          </Pressable>
                        )}
                      </ThemedView>
                    );
                  })}

                  {detail.exercises.length > 0 && (
                    <ThemedView type="backgroundElement" style={styles.sessionRpeCard}>
                      <ThemedText type="smallBold">How did the whole session feel?</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.sessionRpeSubtitle}>
                        Your overall rating for the session -- separate from each exercise's own RPE above.
                      </ThemedText>
                      {detail.status === 'pending' ? (
                        <AnswerInput
                          answerKind="scale"
                          config={{ min: 1, max: 10 }}
                          value={sessionRpe}
                          onChange={(value) => setSessionRpe(typeof value === 'number' ? value : null)}
                        />
                      ) : (
                        <ThemedText type="smallBold">
                          {sessionRpe !== null ? `${sessionRpe}/10` : 'Not rated'}
                        </ThemedText>
                      )}
                    </ThemedView>
                  )}

                  {setError_ && <ThemedText style={styles.error}>{setError_}</ThemedText>}
                  {removeError && <ThemedText style={styles.error}>{removeError}</ThemedText>}
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
                          Mark Workout Complete
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

      <ConfirmDialog
        visible={confirmRemove !== null}
        title={`Remove ${confirmRemove?.name ?? 'this exercise'}?`}
        message="For today's session only -- your programme doesn't change, and it'll be back next time this workout comes up."
        confirmLabel="Remove"
        busy={removingId !== null}
        onConfirm={handleConfirmRemoveExercise}
        onCancel={() => setConfirmRemove(null)}
      />

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
  sessionRpeCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  sessionRpeSubtitle: {
    marginTop: -Spacing.one,
  },
  restTimerValue: {
    fontSize: 36,
  },
  restTimerControls: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.one,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.backgroundElement,
  },
  summaryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  summaryDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.backgroundSelected,
  },
  heartRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  heartRateValue: {
    marginLeft: 'auto',
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
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  swappedNote: {
    color: Colors.tealBright,
  },
  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.backgroundSelected,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    marginTop: Spacing.half,
  },
  tagPillText: {
    color: Colors.tealBright,
  },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  setHeaderSet: {
    width: 32,
  },
  setHeaderInput: {
    flex: 1,
    textAlign: 'center',
  },
  setRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundSelected,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  setRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  setNumberLabel: {
    width: 32,
    fontWeight: '700',
  },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleChecked: {
    ...Glow.oxblood,
    backgroundColor: Accent,
    borderColor: Accent,
  },
  checkboxMark: {
    color: Colors.text,
  },
  setTypeBadge: {
    color: Colors.tealBright,
    fontWeight: '700',
  },
  setTypeDescription: {
    marginLeft: Spacing.four,
  },
  lastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  volumeDeltaUp: {
    color: Colors.tealBright,
  },
  volumeDeltaDown: {
    color: Colors.textSecondary,
  },
  prBadgeRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  prBadge: {
    backgroundColor: Colors.tealDeep,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  prBadgeText: {
    color: Colors.tealBright,
    fontWeight: '700',
  },
  addSetButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  bigInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  rpeLabel: {
    marginTop: Spacing.half,
  },
  prefillLabel: {
    marginTop: Spacing.half,
  },
  input: {
    flex: 1,
    minWidth: 0,
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
