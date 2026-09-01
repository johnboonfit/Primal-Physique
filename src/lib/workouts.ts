import { supabase } from '@/lib/supabase';

export type ExerciseDraft = {
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
 */
export async function createWorkout(coachId: string, name: string, exercises: ExerciseDraft[]) {
  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert({ coach_id: coachId, name })
    .select('id')
    .single();

  if (workoutError) throw workoutError;

  const rows = exercises.map((exercise, index) => ({
    workout_id: workout.id as string,
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
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    exerciseCount: (row.workout_exercises as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}
