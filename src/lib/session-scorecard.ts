import { listExerciseSwapsForAssignment } from '@/lib/exercise-swaps';
import { supabase } from '@/lib/supabase';

export type SessionPB = {
  exerciseLibraryId: string;
  exerciseName: string;
  newWeight: number;
  previousWeight: number;
};

export type SessionScorecard = {
  workoutName: string;
  assignedDate: string;
  /** Sum of weight x reps across every logged set -- 0 for a session
   * logged entirely by reps with no weight (bodyweight work), not null,
   * since "zero weight lifted" is a real, honest answer there. */
  totalWeightLifted: number;
  /** Minutes between the first and last set CHECKED this session --
   * there's no real "session start" captured yet, so this is the closest
   * honest proxy available rather than a fabricated number. Null only if
   * nothing was logged at all. */
  durationMinutes: number | null;
  sessionRpe: number | null;
  pbs: SessionPB[];
};

/**
 * Builds the completion scorecard for one just-finished session: total
 * weight lifted, an approximate duration, the session RPE already saved
 * by finishSession(), and any PBs.
 *
 * A PB is "this session's heaviest weight for an exercise beats every
 * weight this client has EVER logged for that same exercise, in any
 * other session" -- matched by exercise_library_id (the exercise's real
 * identity), not by workout_exercises.id (a fresh row every time an
 * exercise is added to a workout), same reasoning getSetPrefills already
 * uses. A swapped exercise this session is compared as the REPLACEMENT
 * exercise, not the originally-prescribed one -- exactly what was
 * actually performed. An exercise with no previous logged weight at all
 * is never flagged as a PB: there's nothing for a first attempt to beat.
 *
 * Known, deliberate limitation carried over from that same prefill
 * feature: a PAST session's exercise identity is read from its
 * workout_exercises row directly, without re-checking whether THAT past
 * session also had a swap active on the same slot. This only matters if
 * a client swapped the exact same replacement exercise in on two
 * different past occasions -- rare, and consistent with how "previous
 * session" already works everywhere else in this app rather than a more
 * precise (and more complex) version nothing else here has either.
 */
export async function getSessionScorecard(assignmentId: string, clientId: string): Promise<SessionScorecard> {
  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select('assigned_date, session_rpe, workouts(name)')
    .eq('id', assignmentId)
    .single();

  if (assignmentError) throw assignmentError;

  const { data: logs, error: logsError } = await supabase
    .from('workout_logs')
    .select('exercise_id, weight, reps, created_at, workout_exercises(exercise_library_id, name)')
    .eq('assignment_id', assignmentId);

  if (logsError) throw logsError;

  const swaps = await listExerciseSwapsForAssignment(assignmentId);

  const resolved = (logs ?? []).map((row) => {
    const workoutExerciseId = row.exercise_id as string;
    const we = row.workout_exercises as unknown as { exercise_library_id: string | null; name: string } | null;
    const swap = swaps[workoutExerciseId];
    return {
      exerciseLibraryId: swap ? swap.replacementExerciseLibraryId : (we?.exercise_library_id ?? null),
      exerciseName: swap ? swap.replacementName : (we?.name ?? 'Unknown exercise'),
      weight: row.weight as number | null,
      reps: row.reps as number | null,
      createdAt: row.created_at as string,
    };
  });

  const totalWeightLifted = resolved.reduce(
    (sum, set) => sum + (set.weight !== null && set.reps !== null ? set.weight * set.reps : 0),
    0
  );

  const timestamps = resolved.map((set) => new Date(set.createdAt).getTime());
  const durationMinutes = timestamps.length > 0 ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000) : null;

  const sessionBestByExercise = new Map<string, { name: string; weight: number }>();
  resolved.forEach((set) => {
    if (set.exerciseLibraryId === null || set.weight === null) return;
    const current = sessionBestByExercise.get(set.exerciseLibraryId);
    if (!current || set.weight > current.weight) {
      sessionBestByExercise.set(set.exerciseLibraryId, { name: set.exerciseName, weight: set.weight });
    }
  });

  const pbs: SessionPB[] = [];
  if (sessionBestByExercise.size > 0) {
    const libraryIds = new Set(sessionBestByExercise.keys());

    // Every OTHER session's logged weights for this client -- filtered
    // to the exercises we actually care about in JS rather than via a
    // PostgREST filter on the embedded relation, same reasoning
    // getSetPrefills already documents for the identical query shape.
    const { data: priorLogs, error: priorError } = await supabase
      .from('workout_logs')
      .select('weight, workout_exercises!inner(exercise_library_id)')
      .eq('client_id', clientId)
      .neq('assignment_id', assignmentId)
      .not('weight', 'is', null);

    if (priorError) throw priorError;

    const previousBestByLibraryId = new Map<string, number>();
    (priorLogs ?? []).forEach((row) => {
      const libraryId = (row.workout_exercises as unknown as { exercise_library_id: string | null } | null)
        ?.exercise_library_id;
      if (!libraryId || !libraryIds.has(libraryId)) return;
      const weight = row.weight as number;
      const current = previousBestByLibraryId.get(libraryId);
      if (current === undefined || weight > current) previousBestByLibraryId.set(libraryId, weight);
    });

    for (const [exerciseLibraryId, { name, weight }] of sessionBestByExercise.entries()) {
      const previousWeight = previousBestByLibraryId.get(exerciseLibraryId);
      if (previousWeight !== undefined && weight > previousWeight) {
        pbs.push({ exerciseLibraryId, exerciseName: name, newWeight: weight, previousWeight });
      }
    }
  }

  const workout = assignment.workouts as unknown as { name: string } | null;

  return {
    workoutName: workout?.name ?? 'Unknown workout',
    assignedDate: assignment.assigned_date as string,
    totalWeightLifted,
    durationMinutes,
    sessionRpe: assignment.session_rpe as number | null,
    pbs,
  };
}
