import { supabase } from '@/lib/supabase';

export type ExerciseDraft = {
  exerciseLibraryId: string;
  name: string;
  setsReps: string;
};

export type WorkoutSummary = {
  id: string;
  name: string;
  createdAt: string;
  exerciseCount: number;
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
    position: index,
  }));

  const { error: exercisesError } = await supabase.from('workout_exercises').insert(rows);

  if (exercisesError) {
    await supabase.from('workouts').delete().eq('id', workout.id);
    throw exercisesError;
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
