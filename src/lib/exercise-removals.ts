import { supabase } from '@/lib/supabase';

/** Every exercise slot removed for one specific session -- keyed by
 * workout_exercise_id, same shape as listExerciseSwapsForAssignment,
 * since at most one removal per slot per session exists (see the unique
 * constraint in exercise-removals.sql). */
export async function listExerciseRemovalsForAssignment(assignmentId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('assignment_exercise_removals')
    .select('workout_exercise_id')
    .eq('assignment_id', assignmentId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.workout_exercise_id as string));
}

/**
 * Removes one exercise slot from THIS session only -- upserts, so
 * removing an already-removed slot is a harmless no-op rather than
 * erroring on the unique constraint. Never touches workout_exercises,
 * the workout, or the programme -- see exercise-removals.sql for why an
 * in-place edit there would be actively wrong.
 */
export async function removeExerciseForSession(
  assignmentId: string,
  clientId: string,
  workoutExerciseId: string
): Promise<void> {
  const { error } = await supabase.from('assignment_exercise_removals').upsert(
    {
      assignment_id: assignmentId,
      client_id: clientId,
      workout_exercise_id: workoutExerciseId,
    },
    { onConflict: 'assignment_id,workout_exercise_id' }
  );

  if (error) throw error;
}

/** Brings a removed exercise back for this session. */
export async function undoExerciseRemoval(assignmentId: string, workoutExerciseId: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_exercise_removals')
    .delete()
    .eq('assignment_id', assignmentId)
    .eq('workout_exercise_id', workoutExerciseId);

  if (error) throw error;
}
