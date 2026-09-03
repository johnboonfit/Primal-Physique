import { supabase } from '@/lib/supabase';

export type WorkoutOption = {
  id: string;
  name: string;
};

export type ClientOption = {
  id: string;
  email: string;
};

export type AssignmentStatus = 'pending' | 'completed';

export type AssignmentSummary = {
  id: string;
  workoutName: string;
  clientEmail: string;
  assignedDate: string;
  status: AssignmentStatus;
};

export type ClientAssignmentSummary = {
  id: string;
  workoutName: string;
  assignedDate: string;
  status: AssignmentStatus;
};

export type AssignmentDetail = {
  id: string;
  workoutName: string;
  assignedDate: string;
  status: AssignmentStatus;
  exercises: {
    id: string;
    name: string;
    setsReps: string;
    loggedWeight: number | null;
    loggedReps: number | null;
    /** Null for an exercise added before exercise-library linking
     * existed — prefill-by-previous-session has nothing to match on
     * without it, same as an exercise no coach has ever set a baseline
     * for. */
    exerciseLibraryId: string | null;
    /** Null right alongside exerciseLibraryId -- there's nothing to look
     * up a muscle group from without a library link, so no same-group
     * alternatives can be offered for that exercise either. */
    muscleGroup: string | null;
    baselineWeight: number | null;
    baselineReps: number | null;
  }[];
};

/** Where a pre-filled weight/reps value actually came from -- shown to
 * the client so "60 / 8" reads as "your own last session" rather than a
 * mystery number, and so it's possible to verify which fallback fired. */
export type ExercisePrefillSource = 'previous_session' | 'baseline' | 'none';

export type ExercisePrefill = {
  source: ExercisePrefillSource;
  weight: number | null;
  reps: number | null;
};

export type CoachAssignmentDetail = {
  id: string;
  workoutName: string;
  clientEmail: string;
  assignedDate: string;
  status: AssignmentStatus;
  exercises: {
    id: string;
    name: string;
    setsReps: string;
    loggedWeight: number | null;
    loggedReps: number | null;
  }[];
};

export type ExerciseLogEntry = {
  exerciseId: string;
  weight: number | null;
  reps: number | null;
};

export type OverdueAssignment = {
  id: string;
  workoutName: string;
  oldDate: string;
};

export type AutoRescheduleResult = {
  moved: { id: string; workoutName: string; oldDate: string; newDate: string }[];
  needsManual: OverdueAssignment[];
};

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Sunday that ends the current Monday–Sunday week, using the same
 * UTC-based week the Momentum Score already uses — so "this week"
 * means the same thing everywhere in the app. */
function endOfWeek(today: Date) {
  const day = today.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diffToSunday = day === 0 ? 0 : 7 - day;
  return addDays(today, diffToSunday);
}

export async function listCoachWorkoutOptions(coachId: string): Promise<WorkoutOption[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name')
    .eq('coach_id', coachId)
    .eq('archived', false)
    .order('name');

  if (error) throw error;
  return (data ?? []) as WorkoutOption[];
}

export async function listClientOptions(): Promise<ClientOption[]> {
  const { data, error } = await supabase.from('profiles').select('id, email').eq('role', 'client').order('email');

  if (error) throw error;
  return (data ?? []) as ClientOption[];
}

export async function createAssignment(coachId: string, workoutId: string, clientId: string, assignedDate: string) {
  const { error } = await supabase.from('assignments').insert({
    coach_id: coachId,
    workout_id: workoutId,
    client_id: clientId,
    assigned_date: assignedDate,
  });

  if (error) throw error;
}

export async function listAssignments(coachId: string): Promise<AssignmentSummary[]> {
  // "!client_id" tells Supabase which foreign key to follow — assignments
  // points at profiles twice (coach_id and client_id), so without this
  // hint it wouldn't know which relationship we mean.
  const { data, error } = await supabase
    .from('assignments')
    .select('id, assigned_date, status, workouts(name), profiles!client_id(email)')
    .eq('coach_id', coachId)
    .order('assigned_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    workoutName: (row.workouts as unknown as { name: string } | null)?.name ?? 'Unknown workout',
    clientEmail: (row.profiles as unknown as { email: string } | null)?.email ?? 'Unknown client',
    assignedDate: row.assigned_date as string,
    status: row.status as AssignmentStatus,
  }));
}

export async function listMyAssignments(clientId: string): Promise<ClientAssignmentSummary[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id, assigned_date, status, workouts(name)')
    .eq('client_id', clientId)
    .order('assigned_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    workoutName: (row.workouts as unknown as { name: string } | null)?.name ?? 'Unknown workout',
    assignedDate: row.assigned_date as string,
    status: row.status as AssignmentStatus,
  }));
}

export async function getAssignmentDetail(assignmentId: string): Promise<AssignmentDetail> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      'id, assigned_date, status, workouts(name, workout_exercises(id, name, sets_reps, position, exercise_library_id, baseline_weight, baseline_reps, exercise_library(muscle_group)))'
    )
    .eq('id', assignmentId)
    .single();

  if (error) throw error;

  const workout = data.workouts as unknown as {
    name: string;
    workout_exercises: {
      id: string;
      name: string;
      sets_reps: string;
      position: number;
      exercise_library_id: string | null;
      baseline_weight: number | null;
      baseline_reps: number | null;
      exercise_library: { muscle_group: string } | null;
    }[];
  } | null;

  const { data: logs, error: logsError } = await supabase
    .from('workout_logs')
    .select('exercise_id, weight, reps')
    .eq('assignment_id', assignmentId);

  if (logsError) throw logsError;

  const logsByExercise = new Map<string, { weight: number | null; reps: number | null }>();
  (logs ?? []).forEach((log) => {
    logsByExercise.set(log.exercise_id as string, {
      weight: log.weight as number | null,
      reps: log.reps as number | null,
    });
  });

  const exercises = (workout?.workout_exercises ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((exercise) => {
      const logged = logsByExercise.get(exercise.id);
      return {
        id: exercise.id,
        name: exercise.name,
        setsReps: exercise.sets_reps,
        loggedWeight: logged?.weight ?? null,
        loggedReps: logged?.reps ?? null,
        exerciseLibraryId: exercise.exercise_library_id,
        muscleGroup: exercise.exercise_library?.muscle_group ?? null,
        baselineWeight: exercise.baseline_weight,
        baselineReps: exercise.baseline_reps,
      };
    });

  return {
    id: data.id as string,
    workoutName: workout?.name ?? 'Unknown workout',
    assignedDate: data.assigned_date as string,
    status: data.status as AssignmentStatus,
    exercises,
  };
}

/**
 * The fallback chain for a not-yet-logged exercise, one entry per
 * exercise in the current assignment:
 *
 *   1. This client's most recent PREVIOUS logged session for the exact
 *      same library exercise (matched by exercise_library_id, since a
 *      workout_exercises row is a fresh instance every time an exercise
 *      is added to a new workout -- it's the library id that identifies
 *      "the same exercise" across sessions, not workout_exercises.id).
 *   2. The coach's recommended baseline weight/reps for THIS exercise
 *      instance, if one was set when the workout was built.
 *   3. Neither -- the caller shows an empty field with a hint instead of
 *      guessing a number that could be wildly wrong for this exercise.
 *
 * Deliberately excludes the current assignment's own logs (a client
 * reopening a session they've already partly logged should see what
 * THEY entered, not their previous session's numbers -- that's handled
 * separately, before this fallback chain even runs).
 */
export async function getExercisePrefills(
  clientId: string,
  currentAssignmentId: string,
  exercises: { id: string; exerciseLibraryId: string | null; baselineWeight: number | null; baselineReps: number | null }[]
): Promise<Record<string, ExercisePrefill>> {
  const libraryIds = new Set(exercises.map((e) => e.exerciseLibraryId).filter((id): id is string => id !== null));

  const mostRecentByLibraryId = new Map<string, { weight: number | null; reps: number | null }>();

  if (libraryIds.size > 0) {
    // Every one of this client's past logs, most recent first -- filtered
    // to the exercises we actually care about in JS rather than via a
    // PostgREST filter on the embedded relation, which doesn't reliably
    // support filtering by a joined table's column. Fine at this app's
    // scale; the first (most recent) row per library id is the one kept.
    const { data, error } = await supabase
      .from('workout_logs')
      .select('weight, reps, workout_exercises!inner(exercise_library_id)')
      .eq('client_id', clientId)
      .neq('assignment_id', currentAssignmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    for (const row of data ?? []) {
      const libraryId = (row.workout_exercises as unknown as { exercise_library_id: string | null } | null)
        ?.exercise_library_id;
      if (!libraryId || !libraryIds.has(libraryId) || mostRecentByLibraryId.has(libraryId)) continue;
      mostRecentByLibraryId.set(libraryId, { weight: row.weight as number | null, reps: row.reps as number | null });
    }
  }

  const prefills: Record<string, ExercisePrefill> = {};
  for (const exercise of exercises) {
    const previous = exercise.exerciseLibraryId ? mostRecentByLibraryId.get(exercise.exerciseLibraryId) : undefined;
    if (previous && (previous.weight !== null || previous.reps !== null)) {
      prefills[exercise.id] = { source: 'previous_session', weight: previous.weight, reps: previous.reps };
    } else if (exercise.baselineWeight !== null || exercise.baselineReps !== null) {
      prefills[exercise.id] = { source: 'baseline', weight: exercise.baselineWeight, reps: exercise.baselineReps };
    } else {
      prefills[exercise.id] = { source: 'none', weight: null, reps: null };
    }
  }
  return prefills;
}

/** Saves whatever weight/reps were entered, skipping exercises left blank
 * entirely, then flips the assignment to 'completed'. */
export async function logWorkout(clientId: string, assignmentId: string, entries: ExerciseLogEntry[]) {
  const rows = entries
    .filter((entry) => entry.weight !== null || entry.reps !== null)
    .map((entry) => ({
      assignment_id: assignmentId,
      client_id: clientId,
      exercise_id: entry.exerciseId,
      weight: entry.weight,
      reps: entry.reps,
    }));

  if (rows.length > 0) {
    const { error: logError } = await supabase.from('workout_logs').insert(rows);
    if (logError) throw logError;
  }

  const { error: statusError } = await supabase
    .from('assignments')
    .update({ status: 'completed' })
    .eq('id', assignmentId);

  if (statusError) throw statusError;
}

export async function getCoachAssignmentDetail(assignmentId: string): Promise<CoachAssignmentDetail> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      'id, assigned_date, status, profiles!client_id(email), workouts(name, workout_exercises(id, name, sets_reps, position))'
    )
    .eq('id', assignmentId)
    .single();

  if (error) throw error;

  const workout = data.workouts as unknown as {
    name: string;
    workout_exercises: { id: string; name: string; sets_reps: string; position: number }[];
  } | null;

  const { data: logs, error: logsError } = await supabase
    .from('workout_logs')
    .select('exercise_id, weight, reps')
    .eq('assignment_id', assignmentId);

  if (logsError) throw logsError;

  const logsByExercise = new Map<string, { weight: number | null; reps: number | null }>();
  (logs ?? []).forEach((log) => {
    logsByExercise.set(log.exercise_id as string, {
      weight: log.weight as number | null,
      reps: log.reps as number | null,
    });
  });

  const exercises = (workout?.workout_exercises ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((exercise) => {
      const logged = logsByExercise.get(exercise.id);
      return {
        id: exercise.id,
        name: exercise.name,
        setsReps: exercise.sets_reps,
        loggedWeight: logged?.weight ?? null,
        loggedReps: logged?.reps ?? null,
      };
    });

  return {
    id: data.id as string,
    workoutName: workout?.name ?? 'Unknown workout',
    clientEmail: (data.profiles as unknown as { email: string } | null)?.email ?? 'Unknown client',
    assignedDate: data.assigned_date as string,
    status: data.status as AssignmentStatus,
    exercises,
  };
}

/**
 * Finds assignments that are still 'pending' with a scheduled date
 * already in the past, and moves each one to the earliest day between
 * today and the end of this week (Sunday) that doesn't already have
 * something scheduled. An assignment that can't find an open day this
 * week is left untouched and reported back so the client can be asked
 * to pick a date themselves.
 */
export async function autoRescheduleOverdueAssignments(clientId: string): Promise<AutoRescheduleResult> {
  const today = new Date();
  const todayStr = toISODate(today);
  const weekEndStr = toISODate(endOfWeek(today));

  const { data: overdue, error: overdueError } = await supabase
    .from('assignments')
    .select('id, assigned_date, workouts(name)')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .lt('assigned_date', todayStr);

  if (overdueError) throw overdueError;
  if (!overdue || overdue.length === 0) return { moved: [], needsManual: [] };

  const { data: thisWeek, error: weekError } = await supabase
    .from('assignments')
    .select('assigned_date')
    .eq('client_id', clientId)
    .gte('assigned_date', todayStr)
    .lte('assigned_date', weekEndStr);

  if (weekError) throw weekError;

  const occupied = new Set((thisWeek ?? []).map((row) => row.assigned_date as string));

  const moved: AutoRescheduleResult['moved'] = [];
  const needsManual: AutoRescheduleResult['needsManual'] = [];

  for (const row of overdue) {
    const workoutName = (row.workouts as unknown as { name: string } | null)?.name ?? 'Unknown workout';
    const oldDate = row.assigned_date as string;

    let candidate: string | null = null;
    let cursor = today;
    while (toISODate(cursor) <= weekEndStr) {
      const candidateStr = toISODate(cursor);
      if (!occupied.has(candidateStr)) {
        candidate = candidateStr;
        break;
      }
      cursor = addDays(cursor, 1);
    }

    if (candidate) {
      const { error: updateError } = await supabase
        .from('assignments')
        .update({ assigned_date: candidate })
        .eq('id', row.id);
      if (updateError) throw updateError;

      occupied.add(candidate);
      moved.push({ id: row.id as string, workoutName, oldDate, newDate: candidate });
    } else {
      needsManual.push({ id: row.id as string, workoutName, oldDate });
    }
  }

  return { moved, needsManual };
}

/** Lets a client pick their own new date for an assignment the
 * auto-reschedule couldn't place (every day this week was full). */
export async function rescheduleAssignment(assignmentId: string, newDate: string) {
  const { error } = await supabase.from('assignments').update({ assigned_date: newDate }).eq('id', assignmentId);
  if (error) throw error;
}
