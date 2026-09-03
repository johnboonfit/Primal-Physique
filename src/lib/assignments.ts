import type { SetType } from '@/lib/set-types';
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

/** One set a coach explicitly tagged with a training technique -- most
 * exercises have none of these at all (an untagged set is just a plain
 * "Normal" set with no indicator shown). */
export type TaggedSet = {
  setNumber: number;
  setType: SetType;
};

export type AssignmentDetail = {
  id: string;
  workoutName: string;
  assignedDate: string;
  status: AssignmentStatus;
  /** The client's own rating of how the WHOLE session felt, saved once
   * at the end -- separate from the per-set RPE captured on each
   * exercise's last set. Null until they've rated it. */
  sessionRpe: number | null;
  exercises: {
    id: string;
    name: string;
    description: string | null;
    setsReps: string;
    /** How many sets to actually render as checkable rows -- parsed
     * from the leading number in setsReps (e.g. "3x10" -> 3), widened to
     * cover any set the coach explicitly tagged past that number. See
     * parseSetsCount()'s own comment for why this is a heuristic, not an
     * exact structured count. */
    totalSets: number;
    taggedSets: TaggedSet[];
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

/** Where a pre-filled weight/reps value for one SET actually came from --
 * shown to the client so "60 / 8" reads as "your own last session"
 * rather than a mystery number, and so it's possible to verify which
 * fallback fired. */
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
  /** The client's own overall rating of the whole session -- null until
   * they've rated it (or if the session isn't finished yet). */
  sessionRpe: number | null;
  exercises: {
    id: string;
    name: string;
    setsReps: string;
    /** Every logged set for this exercise, in set order -- empty if
     * nothing's been logged for it yet. */
    loggedSets: { setNumber: number; weight: number | null; reps: number | null; rpe: number | null }[];
  }[];
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

const DEFAULT_SETS_COUNT = 3;
const MAX_REASONABLE_SETS = 20;

/**
 * `sets_reps` is free text a coach types ("3x10", "4x8-12", "AMRAP",
 * whatever) -- there's no structured "how many sets" field, so this
 * pulls the leading number out of it as a heuristic. It's genuinely
 * just that: an approximation for how many checkable set rows to show,
 * not an exact count backed by real per-set data. A coach who wants
 * precise control over the set count can tag individual sets (sub-chunk
 * 1); getExerciseSetsCount below widens this number to cover any tagged
 * set past what got parsed here, so an explicit tag never gets hidden.
 */
function parseSetsCount(setsReps: string): number {
  const match = setsReps.trim().match(/^(\d+)/);
  if (!match) return DEFAULT_SETS_COUNT;
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_SETS_COUNT;
  return Math.min(parsed, MAX_REASONABLE_SETS);
}

function getExerciseSetsCount(setsReps: string, taggedSets: TaggedSet[]): number {
  const parsed = parseSetsCount(setsReps);
  const highestTagged = taggedSets.reduce((max, set) => Math.max(max, set.setNumber), 0);
  return Math.max(parsed, highestTagged);
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
    .select('id, assigned_date, status, workouts(name, archived)')
    .eq('client_id', clientId)
    .order('assigned_date', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => {
      const workout = row.workouts as unknown as { archived: boolean } | null;
      // Archiving a workout is meant to pull it out from under a client
      // who hasn't done it yet -- a coach archives something because it's
      // outdated or wrong, and wouldn't want it still sitting in Up Next
      // or the Calendar. It must NOT touch anything already completed,
      // though: that's real logged history, and archive-content.sql's
      // whole point is that archiving never breaks a historical read.
      return row.status !== 'pending' || !workout?.archived;
    })
    .map((row) => ({
      id: row.id as string,
      workoutName: (row.workouts as unknown as { name: string } | null)?.name ?? 'Unknown workout',
      assignedDate: row.assigned_date as string,
      status: row.status as AssignmentStatus,
    }));
}

/**
 * One client's one-off assigned workouts -- deliberately excludes
 * anything whose workout belongs to a programme week, since those are
 * already shown (with their own progress view) under that client's
 * Programme section on the Clients page. Showing them again here would
 * just be the same session twice under two different names.
 */
export async function listClientStandaloneAssignments(clientId: string): Promise<ClientAssignmentSummary[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id, assigned_date, status, workouts(name, programme_week_id)')
    .eq('client_id', clientId)
    .order('assigned_date', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => {
      const workout = row.workouts as unknown as { programme_week_id: string | null } | null;
      return !workout?.programme_week_id;
    })
    .map((row) => ({
      id: row.id as string,
      workoutName: (row.workouts as unknown as { name: string } | null)?.name ?? 'Unknown workout',
      assignedDate: row.assigned_date as string,
      status: row.status as AssignmentStatus,
    }));
}

/**
 * Unassigns one pending workout outright -- safe because nothing
 * references it yet. Refuses a completed one (that's a real result, not
 * a scheduling mistake) and refuses one the client has already started
 * logging sets against, even though it's technically still 'pending',
 * since deleting the assignment would cascade-delete those real logged
 * sets (workout_logs.assignment_id references assignments on delete
 * cascade -- see workout-logs.sql). Either case throws a clear reason
 * instead of silently doing nothing or destroying data.
 */
export async function unassignWorkout(assignmentId: string): Promise<void> {
  const { data: assignment, error: fetchError } = await supabase
    .from('assignments')
    .select('status')
    .eq('id', assignmentId)
    .single();

  if (fetchError) throw fetchError;
  if (assignment.status !== 'pending') {
    throw new Error("This workout has already been completed and can't be unassigned.");
  }

  const { data: logs, error: logsError } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('assignment_id', assignmentId)
    .limit(1);

  if (logsError) throw logsError;
  if ((logs ?? []).length > 0) {
    throw new Error("This client has already started logging sets for this workout, so it can't be unassigned.");
  }

  const { error: deleteError } = await supabase.from('assignments').delete().eq('id', assignmentId);
  if (deleteError) throw deleteError;
}

/**
 * The exercise DEFINITION for a session -- name, description, target
 * sets/reps, baseline, and any tagged set techniques. Deliberately
 * carries no logged data at all: what's actually been done is a
 * completely separate concern now (see set-logging.ts), fetched and
 * merged by the caller, since logging moved from one row per exercise to
 * one row per SET.
 */
export async function getAssignmentDetail(assignmentId: string): Promise<AssignmentDetail> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      'id, assigned_date, status, session_rpe, workouts(name, workout_exercises(id, name, sets_reps, position, exercise_library_id, baseline_weight, baseline_reps, exercise_library(muscle_group, description), workout_exercise_sets(set_number, set_type)))'
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
      exercise_library: { muscle_group: string; description: string | null } | null;
      workout_exercise_sets: { set_number: number; set_type: string }[] | null;
    }[];
  } | null;

  const exercises = (workout?.workout_exercises ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((exercise) => {
      const taggedSets: TaggedSet[] = (exercise.workout_exercise_sets ?? [])
        .map((set) => ({ setNumber: set.set_number, setType: set.set_type as SetType }))
        .sort((a, b) => a.setNumber - b.setNumber);

      return {
        id: exercise.id,
        name: exercise.name,
        description: exercise.exercise_library?.description ?? null,
        setsReps: exercise.sets_reps,
        totalSets: getExerciseSetsCount(exercise.sets_reps, taggedSets),
        taggedSets,
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
    sessionRpe: data.session_rpe as number | null,
    exercises,
  };
}

/**
 * The fallback chain, per SET, for a not-yet-logged set:
 *
 *   1. This client's most recent PREVIOUS session that logged the exact
 *      same library exercise (matched by exercise_library_id, since a
 *      workout_exercises row is a fresh instance every time an exercise
 *      is added to a new workout) -- specifically THAT session's SAME
 *      set number, not just any row for that exercise, so an ascending
 *      pyramid (different weight per set) prefills each set from its own
 *      real history rather than one number smeared across every set.
 *   2. The coach's recommended baseline weight/reps for THIS exercise
 *      instance, applied the same to every set (it's a single starting
 *      point, not a per-set prescription) -- but ONLY if this exercise
 *      was never swapped for a different one this session, since a
 *      baseline set for the original exercise means nothing for
 *      whatever replaced it (the caller is responsible for passing
 *      baselineWeight/baselineReps as null when a swap is active).
 *   3. Neither -- the caller shows an empty field with a hint instead of
 *      guessing a number that could be wildly wrong for this exercise.
 *
 * Deliberately excludes the current assignment's own logs -- a client
 * reopening a session they've already partly logged sees what THEY
 * entered (handled by the caller merging in this session's own set-logs
 * first), never their previous session's numbers instead.
 */
export async function getSetPrefills(
  clientId: string,
  currentAssignmentId: string,
  exercises: {
    id: string;
    exerciseLibraryId: string | null;
    baselineWeight: number | null;
    baselineReps: number | null;
    totalSets: number;
  }[]
): Promise<Record<string, ExercisePrefill>> {
  const libraryIds = new Set(exercises.map((e) => e.exerciseLibraryId).filter((id): id is string => id !== null));

  const mostRecentAssignmentByLibraryId = new Map<string, string>();
  const setsByLibraryId = new Map<string, Map<number, { weight: number | null; reps: number | null }>>();

  if (libraryIds.size > 0) {
    // Every one of this client's past SET logs, most recent first --
    // filtered to the exercises we actually care about in JS rather than
    // via a PostgREST filter on the embedded relation, which doesn't
    // reliably support filtering by a joined table's column. Fine at
    // this app's scale.
    const { data, error } = await supabase
      .from('workout_logs')
      .select('assignment_id, set_number, weight, reps, workout_exercises!inner(exercise_library_id)')
      .eq('client_id', clientId)
      .neq('assignment_id', currentAssignmentId)
      .not('set_number', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = data ?? [];

    // Pass 1: identify, per library id, the single most recent
    // assignment that logged ANY set of it (rows are already
    // most-recent-first, so the first match per library id wins).
    for (const row of rows) {
      const libraryId = (row.workout_exercises as unknown as { exercise_library_id: string | null } | null)
        ?.exercise_library_id;
      if (!libraryId || !libraryIds.has(libraryId) || mostRecentAssignmentByLibraryId.has(libraryId)) continue;
      mostRecentAssignmentByLibraryId.set(libraryId, row.assignment_id as string);
    }

    // Pass 2: pull every set from THAT specific assignment (and that
    // library exercise) into a set_number -> {weight, reps} map, so set
    // 1 prefills from that session's set 1, set 2 from its set 2, etc.
    for (const row of rows) {
      const libraryId = (row.workout_exercises as unknown as { exercise_library_id: string | null } | null)
        ?.exercise_library_id;
      if (!libraryId) continue;
      if (row.assignment_id !== mostRecentAssignmentByLibraryId.get(libraryId)) continue;

      if (!setsByLibraryId.has(libraryId)) setsByLibraryId.set(libraryId, new Map());
      setsByLibraryId
        .get(libraryId)!
        .set(row.set_number as number, { weight: row.weight as number | null, reps: row.reps as number | null });
    }
  }

  const prefills: Record<string, ExercisePrefill> = {};
  for (const exercise of exercises) {
    const previousSets = exercise.exerciseLibraryId ? setsByLibraryId.get(exercise.exerciseLibraryId) : undefined;

    for (let setNumber = 1; setNumber <= exercise.totalSets; setNumber++) {
      const key = `${exercise.id}:${setNumber}`;
      const previous = previousSets?.get(setNumber);

      if (previous && (previous.weight !== null || previous.reps !== null)) {
        prefills[key] = { source: 'previous_session', weight: previous.weight, reps: previous.reps };
      } else if (exercise.baselineWeight !== null || exercise.baselineReps !== null) {
        prefills[key] = { source: 'baseline', weight: exercise.baselineWeight, reps: exercise.baselineReps };
      } else {
        prefills[key] = { source: 'none', weight: null, reps: null };
      }
    }
  }
  return prefills;
}

/** Flips the assignment to 'completed' and saves the session-level RPE
 * in the same write -- per-set logging already happened incrementally,
 * set by set, via set-logging.ts as each one was checked off, so there's
 * nothing else left to save here. sessionRpe is optional (null if the
 * client skipped rating the session, same as any other RPE in this app
 * -- never fabricated to fill the gap). */
export async function finishSession(assignmentId: string, sessionRpe: number | null) {
  const { error } = await supabase
    .from('assignments')
    .update({ status: 'completed', session_rpe: sessionRpe })
    .eq('id', assignmentId);
  if (error) throw error;
}

export async function getCoachAssignmentDetail(assignmentId: string): Promise<CoachAssignmentDetail> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      'id, assigned_date, status, session_rpe, profiles!client_id(email), workouts(name, workout_exercises(id, name, sets_reps, position))'
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
    .select('exercise_id, set_number, weight, reps, rpe')
    .eq('assignment_id', assignmentId)
    .order('set_number', { ascending: true });

  if (logsError) throw logsError;

  const setsByExercise = new Map<
    string,
    { setNumber: number; weight: number | null; reps: number | null; rpe: number | null }[]
  >();
  (logs ?? []).forEach((log) => {
    const exerciseId = log.exercise_id as string;
    const existing = setsByExercise.get(exerciseId) ?? [];
    existing.push({
      // Older, pre-set-level rows have no set_number -- shown as set 1
      // rather than dropped, so a coach reviewing a session logged
      // before this chunk still sees the number that was recorded.
      setNumber: (log.set_number as number | null) ?? 1,
      weight: log.weight as number | null,
      reps: log.reps as number | null,
      rpe: log.rpe as number | null,
    });
    setsByExercise.set(exerciseId, existing);
  });

  const exercises = (workout?.workout_exercises ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      setsReps: exercise.sets_reps,
      loggedSets: setsByExercise.get(exercise.id) ?? [],
    }));

  return {
    id: data.id as string,
    workoutName: workout?.name ?? 'Unknown workout',
    clientEmail: (data.profiles as unknown as { email: string } | null)?.email ?? 'Unknown client',
    assignedDate: data.assigned_date as string,
    status: data.status as AssignmentStatus,
    sessionRpe: data.session_rpe as number | null,
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
