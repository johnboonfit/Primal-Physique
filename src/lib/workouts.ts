import type { SetType } from '@/lib/set-types';
import { supabase } from '@/lib/supabase';

export type ExerciseSetDraft = {
  setNumber: number;
  setType: SetType;
};

export type ExerciseDraft = {
  /** Set only when editing an already-saved exercise row -- tells
   * updateWorkout() to update that row in place (preserving its id, and
   * therefore any workout_logs already logged against it) rather than
   * inserting a new one. Absent for a newly added row. */
  id?: string;
  exerciseLibraryId: string;
  name: string;
  setsReps: string;
  /** Coach-recommended fallback numbers, used when a client has no
   * previous session of their own to log against -- optional, since not
   * every exercise needs one. */
  baselineWeight: number | null;
  baselineReps: number | null;
  /** Individual sets tagged with a technique other than (or including)
   * Normal -- optional and separate from setsReps; most exercises won't
   * have any of these at all. */
  sets: ExerciseSetDraft[];
};

export type WorkoutSummary = {
  id: string;
  name: string;
  createdAt: string;
  exerciseCount: number;
};

export type WorkoutExerciseSet = {
  id: string;
  setNumber: number;
  setType: SetType;
};

export type WorkoutExerciseDetail = {
  id: string;
  name: string;
  setsReps: string;
  baselineWeight: number | null;
  baselineReps: number | null;
  sets: WorkoutExerciseSet[];
  /** Null for an exercise added before exercise-library linking existed.
   * Needed (along with muscleGroup) so the edit form can show it as an
   * already-selected library exercise, exactly as if it had just been
   * picked, instead of forcing a re-search on every edit. */
  exerciseLibraryId: string | null;
  muscleGroup: string | null;
};

export type WorkoutDetail = {
  id: string;
  name: string;
  /** Set only for a workout that's a programme week's session -- lets the
   * edit screen show the same "Week N of <programme>" context the create
   * flow shows. */
  programmeWeekId: string | null;
  exercises: WorkoutExerciseDetail[];
};

/**
 * Saves a workout and its exercises as one unit. If saving the exercises
 * fails after the workout row was already created, we clean up the
 * half-saved workout rather than leaving an empty one behind.
 *
 * `programmeWeekId` is optional — leave it out for the original
 * standalone workout flow. Passing it links this workout to a specific
 * week of a programme instead.
 */
export async function createWorkout(
  coachId: string,
  name: string,
  exercises: ExerciseDraft[],
  programmeWeekId?: string | null
) {
  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert({ coach_id: coachId, name, programme_week_id: programmeWeekId ?? null })
    .select('id')
    .single();

  if (workoutError) throw workoutError;

  const rows = exercises.map((exercise, index) => ({
    workout_id: workout.id as string,
    exercise_library_id: exercise.exerciseLibraryId,
    name: exercise.name,
    sets_reps: exercise.setsReps,
    baseline_weight: exercise.baselineWeight,
    baseline_reps: exercise.baselineReps,
    position: index,
  }));

  // .select('id') is needed here (not just a bare insert) so the
  // per-set type rows below can be attached to the right exercise --
  // Supabase preserves row order on a multi-row insert, so index i of
  // the returned ids always corresponds to index i of `exercises`.
  const { data: insertedExercises, error: exercisesError } = await supabase
    .from('workout_exercises')
    .insert(rows)
    .select('id');

  if (exercisesError) {
    await supabase.from('workouts').delete().eq('id', workout.id);
    throw exercisesError;
  }

  const setRows = exercises.flatMap((exercise, index) =>
    exercise.sets.map((set) => ({
      exercise_id: (insertedExercises as { id: string }[])[index].id,
      set_number: set.setNumber,
      set_type: set.setType,
    }))
  );

  if (setRows.length > 0) {
    const { error: setsError } = await supabase.from('workout_exercise_sets').insert(setRows);
    if (setsError) {
      await supabase.from('workouts').delete().eq('id', workout.id);
      throw setsError;
    }
  }

  return workout.id as string;
}

export async function listWorkouts(coachId: string): Promise<WorkoutSummary[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name, created_at, workout_exercises(count)')
    .eq('coach_id', coachId)
    .eq('archived', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    exerciseCount: (row.workout_exercises as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

/**
 * The full shape of a workout -- every exercise, its baseline
 * weight/reps, and any individually-tagged sets, in order. This is the
 * exact query a client-facing screen will need to reuse; verifying it
 * here now (before that screen exists) confirms the data really is
 * queryable end to end, not just present in the coach's create form.
 */
export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail> {
  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .select('id, name, programme_week_id')
    .eq('id', workoutId)
    .single();

  if (workoutError) throw workoutError;

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('workout_exercises')
    .select(
      'id, name, sets_reps, baseline_weight, baseline_reps, exercise_library_id, exercise_library(muscle_group), workout_exercise_sets (id, set_number, set_type)'
    )
    .eq('workout_id', workoutId)
    .order('position', { ascending: true });

  if (exercisesError) throw exercisesError;

  const exercises: WorkoutExerciseDetail[] = (exerciseRows ?? []).map((row) => {
    const setRows = (row.workout_exercise_sets as { id: string; set_number: number; set_type: string }[]) ?? [];
    return {
      id: row.id as string,
      name: row.name as string,
      setsReps: row.sets_reps as string,
      baselineWeight: row.baseline_weight as number | null,
      baselineReps: row.baseline_reps as number | null,
      exerciseLibraryId: row.exercise_library_id as string | null,
      muscleGroup: (row.exercise_library as unknown as { muscle_group: string } | null)?.muscle_group ?? null,
      sets: setRows
        .map((set) => ({ id: set.id, setNumber: set.set_number, setType: set.set_type as SetType }))
        .sort((a, b) => a.setNumber - b.setNumber),
    };
  });

  return {
    id: workout.id as string,
    name: workout.name as string,
    programmeWeekId: workout.programme_week_id as string | null,
    exercises,
  };
}

/**
 * Saves edits to an already-existing workout: renames it, then reconciles
 * its exercises against the edited list rather than deleting and
 * recreating all of them. Every exercise the coach kept (identified by
 * still carrying its original `id`) is updated IN PLACE, so its id never
 * changes -- which is exactly what keeps any workout_logs already logged
 * against it (from a client's pending or completed session) correctly
 * attached. Only a newly-added row gets a fresh insert.
 *
 * An exercise the coach removed is only actually deleted once confirmed
 * to have zero logged sets anywhere -- deleting one that a client has
 * already logged against would cascade-delete that real history, exactly
 * what archiving-not-deleting exists everywhere else in this app to
 * prevent. Removing one that already has logs throws instead, naming it,
 * so the coach can decide (e.g. leave it, or rename it) rather than
 * silently losing a client's data.
 */
export async function updateWorkout(workoutId: string, name: string, exercises: ExerciseDraft[]) {
  const { error: nameError } = await supabase.from('workouts').update({ name }).eq('id', workoutId);
  if (nameError) throw nameError;

  const { data: existingRows, error: existingError } = await supabase
    .from('workout_exercises')
    .select('id, name')
    .eq('workout_id', workoutId);

  if (existingError) throw existingError;

  const keptIds = new Set(exercises.filter((e) => e.id).map((e) => e.id as string));
  const removed = (existingRows ?? []).filter((row) => !keptIds.has(row.id as string));

  if (removed.length > 0) {
    const removedIds = removed.map((row) => row.id as string);
    const { data: logs, error: logsError } = await supabase
      .from('workout_logs')
      .select('exercise_id')
      .in('exercise_id', removedIds)
      .limit(1);

    if (logsError) throw logsError;
    if ((logs ?? []).length > 0) {
      const loggedRemoved = removed.find((row) => (logs ?? []).some((log) => log.exercise_id === row.id));
      throw new Error(
        `"${loggedRemoved?.name ?? 'One of the removed exercises'}" already has logged sets from a client and can't be removed. ` +
          `Leave it in the workout (you can still edit its name, sets/reps, or baseline) instead of deleting it.`
      );
    }

    const { error: deleteSetsError } = await supabase.from('workout_exercise_sets').delete().in('exercise_id', removedIds);
    if (deleteSetsError) throw deleteSetsError;
    const { error: deleteExercisesError } = await supabase.from('workout_exercises').delete().in('id', removedIds);
    if (deleteExercisesError) throw deleteExercisesError;
  }

  for (let index = 0; index < exercises.length; index++) {
    const exercise = exercises[index];
    const baseRow = {
      exercise_library_id: exercise.exerciseLibraryId,
      name: exercise.name,
      sets_reps: exercise.setsReps,
      baseline_weight: exercise.baselineWeight,
      baseline_reps: exercise.baselineReps,
      position: index,
    };

    let exerciseId = exercise.id ?? null;

    if (exerciseId) {
      const { error: updateError } = await supabase.from('workout_exercises').update(baseRow).eq('id', exerciseId);
      if (updateError) throw updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('workout_exercises')
        .insert({ workout_id: workoutId, ...baseRow })
        .select('id')
        .single();
      if (insertError) throw insertError;
      exerciseId = inserted.id as string;
    }

    // Tagged sets aren't referenced by anything else (workout_logs stores
    // its own set_number directly, not a pointer to this table), so
    // replacing them outright on every save is safe and far simpler than
    // reconciling each one.
    const { error: deleteSetsError } = await supabase.from('workout_exercise_sets').delete().eq('exercise_id', exerciseId);
    if (deleteSetsError) throw deleteSetsError;

    if (exercise.sets.length > 0) {
      const { error: insertSetsError } = await supabase.from('workout_exercise_sets').insert(
        exercise.sets.map((set) => ({ exercise_id: exerciseId, set_number: set.setNumber, set_type: set.setType }))
      );
      if (insertSetsError) throw insertSetsError;
    }
  }
}

/** Archiving, not deleting — assignments and workout_logs reference this
 * row (directly, and via workout_exercises) and must survive untouched.
 * See archive-content.sql for why. */
export async function archiveWorkout(workoutId: string) {
  const { error } = await supabase.from('workouts').update({ archived: true }).eq('id', workoutId);
  if (error) throw error;
}

/** Sessions that belong to one specific week of a programme, in the
 * order they were added. */
export async function listWorkoutsForWeek(programmeWeekId: string): Promise<WorkoutSummary[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name, created_at, workout_exercises(count)')
    .eq('programme_week_id', programmeWeekId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    exerciseCount: (row.workout_exercises as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}
