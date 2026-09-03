import { supabase } from '@/lib/supabase';

export type ExerciseSwap = {
  id: string;
  workoutExerciseId: string;
  replacementExerciseLibraryId: string;
  replacementName: string;
};

/** Every swap recorded for one specific session, keyed by which exercise
 * slot (workout_exercises.id) it replaces -- there's at most one active
 * swap per slot per session (see the unique constraint in
 * exercise-swaps.sql), so a plain map is enough. */
export async function listExerciseSwapsForAssignment(assignmentId: string): Promise<Record<string, ExerciseSwap>> {
  const { data, error } = await supabase
    .from('assignment_exercise_swaps')
    .select('id, workout_exercise_id, replacement_exercise_library_id, replacement_name')
    .eq('assignment_id', assignmentId);

  if (error) throw error;

  const bySlot: Record<string, ExerciseSwap> = {};
  (data ?? []).forEach((row) => {
    bySlot[row.workout_exercise_id as string] = {
      id: row.id as string,
      workoutExerciseId: row.workout_exercise_id as string,
      replacementExerciseLibraryId: row.replacement_exercise_library_id as string,
      replacementName: row.replacement_name as string,
    };
  });
  return bySlot;
}

/**
 * Records a same-muscle-group substitution for one exercise slot, for
 * THIS session only -- upserts, so swapping an already-swapped slot to
 * something else just replaces the earlier choice rather than erroring
 * on the unique constraint. Never touches workout_exercises, the
 * workout, or the programme it belongs to; see exercise-swaps.sql for
 * why that would be actively wrong (that row is shared across every
 * assignment referencing it, not copied per-assignment).
 */
export async function swapExerciseForSession(
  assignmentId: string,
  clientId: string,
  workoutExerciseId: string,
  replacement: { exerciseLibraryId: string; name: string }
) {
  const { error } = await supabase.from('assignment_exercise_swaps').upsert(
    {
      assignment_id: assignmentId,
      client_id: clientId,
      workout_exercise_id: workoutExerciseId,
      replacement_exercise_library_id: replacement.exerciseLibraryId,
      replacement_name: replacement.name,
    },
    { onConflict: 'assignment_id,workout_exercise_id' }
  );

  if (error) throw error;
}

/** Reverts one exercise slot back to whatever the workout/programme
 * originally prescribed for this session. */
export async function undoExerciseSwap(assignmentId: string, workoutExerciseId: string) {
  const { error } = await supabase
    .from('assignment_exercise_swaps')
    .delete()
    .eq('assignment_id', assignmentId)
    .eq('workout_exercise_id', workoutExerciseId);

  if (error) throw error;
}
