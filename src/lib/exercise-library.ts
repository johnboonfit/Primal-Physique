import { supabase } from '@/lib/supabase';

export type MuscleGroup = 'arms' | 'back' | 'calves' | 'chest' | 'core' | 'legs' | 'shoulders';

export const MUSCLE_GROUPS: { key: MuscleGroup; label: string }[] = [
  { key: 'arms', label: 'Arms' },
  { key: 'back', label: 'Back' },
  { key: 'calves', label: 'Calves' },
  { key: 'chest', label: 'Chest' },
  { key: 'core', label: 'Core' },
  { key: 'legs', label: 'Legs' },
  { key: 'shoulders', label: 'Shoulders' },
];

export const EXERCISE_CATEGORIES = ['strength', 'cardio', 'stretching', 'plyometrics', 'calisthenics', 'strongman', 'olympic'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const EXERCISE_EQUIPMENT = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'bands',
  'bench',
  'ez curl bar',
  'exercise ball',
  'medicine ball',
  'foam roll',
  'none',
  'other',
] as const;

export type ExerciseSummary = {
  id: string;
  name: string;
  muscleGroup: string;
  category: string;
  equipment: string[];
  description: string | null;
  /** True only for a row the coach added themselves -- the ~872 seeded
   * reference rows are always false and can never be edited or deleted. */
  isCustom: boolean;
};

export type ExerciseDetail = ExerciseSummary & {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  description: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  attribution: string;
};

export type CustomExerciseDraft = {
  name: string;
  category: string;
  muscleGroup: MuscleGroup;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string[];
  description: string | null;
  videoUrl: string | null;
};

const UNIQUE_VIOLATION = '23505';

/**
 * Just the fields the browse list needs — name, group, category,
 * equipment — for every row in the library. There are only ~870
 * exercises total (it's a one-time imported reference table, not
 * something that grows with usage), so fetching the whole light-weight
 * list once and filtering client-side is simpler than paginating or
 * re-querying on every keystroke.
 */
export async function listExerciseLibrarySummaries(): Promise<ExerciseSummary[]> {
  const { data, error } = await supabase
    .from('exercise_library')
    .select('id, name, muscle_group, category, equipment, description, is_custom')
    .order('name');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    muscleGroup: row.muscle_group as string,
    category: row.category as string,
    equipment: (row.equipment as string[] | null) ?? [],
    description: row.description as string | null,
    isCustom: (row.is_custom as boolean | null) ?? false,
  }));
}

/** The heavier fields (instructions, attribution, etc.) — fetched only
 * when a coach actually expands one exercise to look at it. */
export async function getExerciseDetail(id: string): Promise<ExerciseDetail> {
  const { data, error } = await supabase
    .from('exercise_library')
    .select(
      'id, name, muscle_group, category, equipment, primary_muscles, secondary_muscles, instructions, description, video_url, image_url, image_urls, attribution, is_custom'
    )
    .eq('id', id)
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    name: data.name as string,
    muscleGroup: data.muscle_group as string,
    category: data.category as string,
    equipment: (data.equipment as string[] | null) ?? [],
    primaryMuscles: (data.primary_muscles as string[] | null) ?? [],
    secondaryMuscles: (data.secondary_muscles as string[] | null) ?? [],
    instructions: (data.instructions as string[] | null) ?? [],
    description: data.description as string | null,
    videoUrl: data.video_url as string | null,
    imageUrl: data.image_url as string | null,
    imageUrls: (data.image_urls as string[] | null) ?? [],
    attribution: data.attribution as string,
    isCustom: (data.is_custom as boolean | null) ?? false,
  };
}

/** Adds a brand-new exercise to the library -- same shape as every seeded
 * row, plus is_custom/created_by marking it as the coach's own so it can
 * later be edited or deleted (the 872 seeded rows never can be). Once
 * saved it's immediately searchable from the workout builder exactly
 * like any seeded exercise, since that search runs against this same
 * table with no distinction between the two. */
export async function createCustomExercise(coachId: string, draft: CustomExerciseDraft): Promise<string> {
  const { data, error } = await supabase
    .from('exercise_library')
    .insert({
      name: draft.name,
      category: draft.category,
      muscle_group: draft.muscleGroup,
      primary_muscles: draft.primaryMuscles,
      secondary_muscles: draft.secondaryMuscles,
      equipment: draft.equipment,
      instructions: draft.instructions,
      description: draft.description,
      video_url: draft.videoUrl,
      attribution: 'Added by your coach',
      is_custom: true,
      created_by: coachId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error('An exercise with that name already exists in the library.');
    throw error;
  }
  return data.id as string;
}

/** Column-level update grant only lets a coach touch their own is_custom
 * rows (see custom-exercises.sql) -- an attempt against a seeded
 * reference row or another coach's custom one affects zero rows rather
 * than throwing, so there's nothing further to check here. */
export async function updateCustomExercise(id: string, draft: CustomExerciseDraft): Promise<void> {
  const { data, error } = await supabase
    .from('exercise_library')
    .update({
      name: draft.name,
      category: draft.category,
      muscle_group: draft.muscleGroup,
      primary_muscles: draft.primaryMuscles,
      secondary_muscles: draft.secondaryMuscles,
      equipment: draft.equipment,
      instructions: draft.instructions,
      description: draft.description,
      video_url: draft.videoUrl,
    })
    .eq('id', id)
    .select('id');

  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error('An exercise with that name already exists in the library.');
    throw error;
  }
  if ((data ?? []).length === 0) {
    throw new Error("This isn't a custom exercise you added, so it can't be edited.");
  }
}

/** Refuses to delete an exercise that's currently used in any workout --
 * same "don't silently orphan a client's data" rule updateWorkout() already
 * applies to a removed exercise with logged sets, and the exact gap a
 * past chunk had to backfill for the Volume Analyser when exercise_library
 * links went missing. */
export async function deleteCustomExercise(id: string): Promise<void> {
  const { count, error: checkError } = await supabase
    .from('workout_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_library_id', id);

  if (checkError) throw checkError;
  if ((count ?? 0) > 0) {
    throw new Error(
      "This exercise is used in one or more workouts and can't be deleted. Remove it from those workouts first, or leave it as is."
    );
  }

  const { error } = await supabase.from('exercise_library').delete().eq('id', id);
  if (error) throw error;
}
